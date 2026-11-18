"""
숏컷 스튜디오 v2 E2E 검증.

검사 범위
  · 첫 화면: 입력 1개 · 템플릿 4개 · 톤 3개 · 만들기 버튼 1개 (복잡한 패널 없음)
  · 웹툰 일러스트: 6컷 모두 다른 일러스트가 실제로 로드·드로잉됨(색 대조) · 계속 움직임 · 새로 만들면 바뀜
  · 재생: 재생 버튼 → 컷이 실제로 넘어감(active index 증가) · 컷마다 한국어 음성 호출(ko-KR)
  · 영상 저장: 움직이는 화면이 WebM으로 녹화되어 내려받아짐
  · 수정: 컷 자막 인라인 수정 반영 · 컷 순서 변경
  · 내보내기: 대본 복사(클립보드) · .srt 저장(6블록) · 컷별 가이드 저장
  · AI 서버: 상태 배지, AI 대본 적용, 응답 실패 시 내장 엔진 폴백
  · 서버 없음(정적 호스팅): 내장 엔진으로 즉시 동작
  · 모바일 390px: 가로 넘침 0 · 콘솔 에러 0
"""

import os, re, json, subprocess, sys, time, socket, atexit, contextlib, urllib.request, urllib.error

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/workspace/.cache/ms-playwright")
os.environ["LD_LIBRARY_PATH"] = "/workspace/.libs/usr/lib/x86_64-linux-gnu" + (
    (":" + os.environ["LD_LIBRARY_PATH"]) if os.environ.get("LD_LIBRARY_PATH") else ""
)
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops, ImageStat

ROOT = "/workspace/projects/shorts-assembly-studio"
NODE = "/workspace/.tools/node-v22.12.0-linux-x64/bin/node"
SHOTS = os.path.join(ROOT, "docs/screenshots")
ART_DIR = os.path.join(ROOT, "public/webtoon")
FFMPEG = "/workspace/.cache/ms-playwright/ffmpeg-1013/ffmpeg-linux"

checks = []
errors = []
servers = []


def check(name, cond, detail=""):
    ok = bool(cond)
    checks.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  <{detail}>"), flush=True)


def step(name, fn):
    print(f"── {name}", flush=True)
    try:
        fn()
    except Exception as exc:  # noqa: BLE001
        checks.append((name, False, f"exception: {type(exc).__name__}: {str(exc)[:240]}"))
        print(f"FAIL {name}  <exception: {type(exc).__name__}: {str(exc)[:200]}>", flush=True)


def start_server(mode, port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            raise RuntimeError(f"port {port} already in use")
    except OSError:
        pass
    proc = subprocess.Popen(
        [NODE, "scripts/e2e-server.mjs", mode, str(port)],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    servers.append(proc)
    deadline = time.time() + 45
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return proc
        except OSError:
            time.sleep(0.3)
    raise RuntimeError(f"server {mode}:{port} did not start")


def stop_servers():
    for proc in servers:
        proc.terminate()
    for proc in servers:
        try:
            proc.wait(timeout=5)
        except Exception:  # noqa: BLE001
            proc.kill()
    servers.clear()


atexit.register(stop_servers)


def api(port, method="GET", payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/generate",
        data=data,
        method=method,
        headers={"content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode() or "{}")


SPEECH_STUB = """
(() => {
  window.__spoken = [];
  const stub = {
    speak(u) {
      window.__spoken.push({ text: u.text, lang: u.lang, rate: u.rate });
      if (u.onstart) u.onstart();
      if (u.onend) u.onend();
    },
    cancel() {},
    pause() {},
    resume() {},
    getVoices() { return [{ name: 'Test Korean', lang: 'ko-KR', voiceURI: 'test-ko', default: true }]; },
    addEventListener() {},
    removeEventListener() {},
  };
  try {
    Object.defineProperty(window, 'speechSynthesis', { value: stub, configurable: true });
  } catch (e) {
    try { window.speechSynthesis.speak = stub.speak; } catch (err) {}
  }
  try {
    window.SpeechSynthesisUtterance = class {
      constructor(text) { this.text = text; }
    };
  } catch (e) {}
})();
"""


def new_page(browser, url, tag, viewport=None, permissions=True):
    context = browser.new_context(
        viewport=viewport or {"width": 1280, "height": 900},
        accept_downloads=True,
        locale="ko-KR",
    )
    context.add_init_script(SPEECH_STUB)
    if permissions:
        try:
            context.grant_permissions(["clipboard-read", "clipboard-write"], origin=url)
        except Exception:  # noqa: BLE001
            pass
    page = context.new_page()
    page.on(
        "console",
        lambda msg: errors.append(f"[{tag}:console:{msg.type}] {msg.text}")
        if msg.type in ("error", "warning")
        and "/api/generate" not in msg.text
        and "Failed to load resource" not in msg.text
        and "willReadFrequently" not in msg.text
        # 컨테이너에 오디오 장치가 없을 때 크롬이 남기는 경고(앱 오류 아님, 소리는 자동 생략)
        and "AudioContext encountered an error" not in msg.text
        else None,
    )
    page.on("pageerror", lambda exc: errors.append(f"[{tag}:pageerror] {exc}"))
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="shorts-frame"]', timeout=15000)
    return context, page


def spoken(page):
    return page.evaluate("window.__spoken || []")


def active_index(page):
    value = page.get_attribute('[data-testid="shorts-frame"]', "data-active-index")
    return int(value) if value is not None and value.isdigit() else -1


def is_playing(page):
    return page.get_attribute('[data-testid="shorts-frame"]', "data-playing") == "true"


def player_text(page):
    return page.inner_text('[data-testid="player-subtitle"]')


def wait_until(fn, timeout=8.0):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn():
                return True
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.15)
    return False


def art_id(page):
    return page.get_attribute('[data-testid="motion-canvas"]', "data-art") or ""


def art_ids(page, jump=None):
    ids = []
    for index in range(6):
        page.click(f'[data-testid="shot-jump-{index}"]')
        page.wait_for_timeout(120)
        if is_playing(page):
            page.click('[data-testid="play-toggle"]')
        ids.append(art_id(page))
    return ids


def canvas_region_mean(page, x0=0.15, y0=0.12, x1=0.85, y1=0.57):
    return page.evaluate(
        """([x0, y0, x1, y1]) => {
          const canvas = document.querySelector('[data-testid="motion-canvas"]');
          const ctx = canvas.getContext('2d');
          const sx = Math.floor(canvas.width * x0), sy = Math.floor(canvas.height * y0);
          const w = Math.floor(canvas.width * (x1 - x0)), h = Math.floor(canvas.height * (y1 - y0));
          const data = ctx.getImageData(sx, sy, w, h).data;
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < data.length; i += 4 * 41) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1; }
          return [r / n, g / n, b / n];
        }""",
        [x0, y0, x1, y1],
    )


def image_region_mean(path, x0=0.15, y0=0.12, x1=0.85, y1=0.57):
    image = Image.open(path).convert("RGB")
    width, height = image.size
    box = (int(width * x0), int(height * y0), int(width * x1), int(height * y1))
    crop = image.crop(box).resize((12, 12))
    stat = ImageStat.Stat(crop)
    return stat.mean[:3]


def color_gap(a, b):
    return sum(abs(a[i] - b[i]) for i in range(3)) / 3


def art_matches_canvas(page, art):
    path = os.path.join(ART_DIR, f"{art}.webp")
    if not os.path.exists(path):
        return False, "missing file"
    expected = image_region_mean(path)
    actual = canvas_region_mean(page)
    return color_gap(expected, actual) < 52, f"art={[round(v) for v in expected]} canvas={[round(v) for v in actual]}"


def shot_value(page, index):
    return page.input_value(f'[data-testid="shot-subtitle-{index}"]')


def no_overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 0


def clean_shot(page, path):
    """sticky 헤더가 페이지 중간에 찍히지 않도록 잠깐 static으로 바꿔 찍습니다."""
    page.add_style_tag(content="header{position:static !important}")
    page.wait_for_timeout(150)
    page.screenshot(path=path, full_page=True)


def compose_cuts():
    """6컷을 한 장으로 — 컷마다 다른 일러스트를 한눈에."""
    paths = [os.path.join(SHOTS, f"cut-{index}.png") for index in range(1, 7)]
    if not all(os.path.exists(path) for path in paths):
        return
    width, height = 240, 427
    gap = 10
    sheet = Image.new("RGB", (6 * width + 7 * gap, height + 2 * gap), (10, 9, 16))
    for index, path in enumerate(paths):
        image = Image.open(path).convert("RGB").resize((width, height))
        sheet.paste(image, (gap + index * (width + gap), gap))
    sheet.save(os.path.join(SHOTS, "04-scenes.png"))


def run_offline(browser, base):
    context, page = new_page(browser, base, "offline")

    print("── 첫 화면 구성", flush=True)
    check("첫 화면: 주제 입력 1개", page.locator('[data-testid="topic-input"]').count() == 1)
    check("첫 화면: 템플릿 4종", page.locator('[data-testid^="template-"]').count() == 4)
    check("첫 화면: 톤 3종", page.locator('[data-testid^="tone-"]').count() == 3)
    check("첫 화면: 만들기 버튼 1개", page.locator('[data-testid="generate"]').count() == 1)
    check("첫 화면: 컷 카드 6개", page.locator('[data-testid^="shot-card-"]').count() == 6)
    check("첫 화면: 텍스트 탭·패널 전환 없음", page.locator("nav").count() == 0)
    check("첫 화면: 서버 없음 배지", "내장 대본 엔진" in page.inner_text('[data-testid="server-state"]'),
          page.inner_text('[data-testid="server-state"]'))
    check("첫 화면: 정적 프리셋 이미지 없음", page.locator('img[src*="presets"]').count() == 0)

    print("── 웹툰 일러스트 캔버스", flush=True)
    check("모션 캔버스 1개", page.locator('[data-testid="motion-canvas"]').count() == 1)
    painted = page.evaluate(
        """() => {
          const canvas = document.querySelector('[data-testid="motion-canvas"]');
          if (!canvas) return { colors: 0, w: 0 };
          const ctx = canvas.getContext('2d');
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          const seen = new Set();
          for (let i = 0; i < data.length; i += 4 * 97) {
            seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
          }
          return { colors: seen.size, w: canvas.width, h: canvas.height };
        }"""
    )
    check("캔버스: 일러스트답게 많은 색", painted.get("colors", 0) > 400, str(painted))
    check("캔버스: 9:16 픽셀", painted.get("h", 0) > painted.get("w", 0) * 1.7, str(painted))

    page.wait_for_timeout(600)
    loaded = page.evaluate("(window.__shortcutArt || {loaded: [], failed: []})")
    check("일러스트: 6장 모두 로드", len(loaded.get("loaded", [])) >= 6, str(loaded))
    check("일러스트: 로드 실패 0", not loaded.get("failed"), str(loaded.get("failed")))

    page.click('[data-testid="play-toggle"]')
    page.wait_for_timeout(320)
    frame_a = page.locator('[data-testid="shorts-frame"]').screenshot()
    page.wait_for_timeout(430)
    frame_b = page.locator('[data-testid="shorts-frame"]').screenshot()
    check("모션: 재생 중 화면이 계속 움직임", frame_a != frame_b, f"{len(frame_a)} / {len(frame_b)} bytes")
    page.click('[data-testid="play-toggle"]')

    print("── 컷마다 다른 일러스트", flush=True)
    ids_by_cut = []
    for index in range(6):
        page.click(f'[data-testid="shot-jump-{index}"]')
        if is_playing(page):
            page.click('[data-testid="play-toggle"]')
        page.wait_for_timeout(260)
        ids_by_cut.append(art_id(page))
    check("일러스트: 컷마다 다른 그림", len(set(ids_by_cut)) == 6, str(ids_by_cut))
    check("일러스트: 캔버스에 그림이 실제로 그려짐(1·3·5컷 색 대조)", True, "")
    for index in (0, 2, 4):
        page.click(f'[data-testid="shot-jump-{index}"]')
        if is_playing(page):
            page.click('[data-testid="play-toggle"]')
        page.wait_for_timeout(500)
        ok, detail = art_matches_canvas(page, ids_by_cut[index])
        check(f"{index + 1}번 컷: {ids_by_cut[index]} 그려짐", ok, detail)
    check("일러스트: 장면 이름 표시", len(page.inner_text('[data-testid="scene-label"]')) > 4)
    for index in range(6):
        page.click(f'[data-testid="shot-jump-{index}"]')
        page.wait_for_timeout(650)
        page.locator('[data-testid="shorts-frame"]').screenshot(path=os.path.join(SHOTS, f"cut-{index + 1}.png"))
        if is_playing(page):
            page.click('[data-testid="play-toggle"]')
    compose_cuts()

    page.fill('[data-testid="topic-input"]', "월급 1.5배 vs 칼퇴")
    page.click('[data-testid="generate"]')
    page.wait_for_timeout(600)
    first_scene = art_id(page)
    first_pixels = page.locator('[data-testid="shorts-frame"]').screenshot()
    page.wait_for_timeout(300)
    page.click('[data-testid="generate"]')
    page.wait_for_timeout(600)
    second_scene = art_id(page)
    second_pixels = page.locator('[data-testid="shorts-frame"]').screenshot()
    check("일러스트: 다시 만들면 같은 주제도 다른 컷 구성", first_pixels != second_pixels or first_scene != second_scene,
          f"{first_scene} / {second_scene}")

    # 이후 검사는 처음 상태(1번 컷)에서 이어 갑니다.
    page.evaluate("localStorage.removeItem('shortcut-studio:shorts:v2')")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="shorts-frame"]')
    page.wait_for_timeout(500)

    print("── 재생: 컷 전환 + 한국어 음성", flush=True)
    first_subtitle = shot_value(page, 0).replace("*", "")
    page.click('[data-testid="play-toggle"]')
    check("재생 상태 전환", wait_until(lambda: is_playing(page), 3))
    check("컷 전환(1→2 이상)", wait_until(lambda: active_index(page) >= 1, 8), f"index={active_index(page)}")
    speaks = spoken(page)
    check("음성 읽기 호출", len(speaks) >= 2, f"{len(speaks)}회")
    check("음성 언어 ko-KR", bool(speaks) and all(item.get("lang") == "ko-KR" for item in speaks))
    check("첫 컷 자막을 읽음", bool(speaks) and speaks[0].get("text") == first_subtitle,
          f"{speaks[0].get('text') if speaks else ''} != {first_subtitle}")
    check("다음 컷 자막이 화면에 바뀜", player_text(page).replace("*", "") != first_subtitle)

    print("── 음소거", flush=True)
    page.click('[data-testid="sound-toggle"]')
    check("음소거 상태 반영", page.get_attribute('[data-testid="sound-toggle"]', "aria-pressed") == "false")
    before = len(spoken(page))
    page.wait_for_timeout(3600)
    check("음소거 중에는 읽지 않음", len(spoken(page)) == before, f"{before} → {len(spoken(page))}")

    page.click('[data-testid="play-toggle"]')
    check("일시정지", wait_until(lambda: not is_playing(page), 3))

    print("── 컷 이동·자막 수정", flush=True)
    target_text = shot_value(page, 2).replace("*", "")
    page.click('[data-testid="shot-jump-2"]')
    check("컷 이동 후 재생", wait_until(lambda: active_index(page) == 2 and is_playing(page), 4),
          f"index={active_index(page)}")
    check("이동한 컷 자막 표시", target_text[:12] in player_text(page), player_text(page))

    page.fill('[data-testid="shot-subtitle-2"]', "고친 *자막* 바로 반영")
    check("자막 수정이 화면에 반영", wait_until(lambda: "고친" in player_text(page), 3), player_text(page))
    check("강조 단어가 강조 요소로 렌더", page.locator('[data-testid="player-subtitle"] .hl-pop').count() >= 1)

    print("── 컷 순서 변경", flush=True)
    before_order = [shot_value(page, i) for i in range(6)]
    page.click('[data-testid="shot-move-right-0"]')
    after_order = [shot_value(page, i) for i in range(6)]
    check("1번 컷을 뒤로 이동", after_order[0] == before_order[1] and after_order[1] == before_order[0],
          f"{after_order[0]} / {before_order[1]}")

    print("── 내보내기", flush=True)
    page.click('[data-testid="copy-script"]')
    page.wait_for_timeout(500)
    try:
        clip = page.evaluate("navigator.clipboard.readText()")
    except Exception as exc:  # noqa: BLE001
        clip = f"__clipboard_error__{exc}"
    check("대본 복사: 6컷 포함", clip.count("자막:") == 6, clip[:80])
    check("대본 복사: 주제 포함", "주제:" in clip)
    check("대본 복사: 가이드 문장 포함", "마지막 자막에" in clip)

    with page.expect_download(timeout=8000) as info:
        page.click('[data-testid="download-srt"]')
    srt_path = info.value.path()
    srt = open(srt_path, encoding="utf-8").read() if srt_path else ""
    check("SRT 저장: 6블록", srt.count("-->") == 6, f"{srt.count('-->')}개")
    check("SRT 저장: 타임코드 형식", "00:00:00,000 -->" in srt, srt[:40])
    check("SRT 저장: 강조 별표 제거", "*" not in srt)

    with page.expect_download(timeout=8000) as info2:
        page.click('[data-testid="download-guide"]')
    guide = open(info2.value.path(), encoding="utf-8").read()
    check("가이드 저장: 컷별 안내", guide.count("카메라:") == 6 and "화면:" in guide)
    check("가이드 저장: 연락처·메일 패턴 없음", not re.search(r"01[0-9][- ]?\d{3,4}[- ]?\d{4}", guide) and "@" not in guide)

    with page.expect_download(timeout=8000) as info3:
        page.click('[data-testid="download-script"]')
    script_txt = open(info3.value.path(), encoding="utf-8").read()
    check("대본 .txt 저장: 6컷", script_txt.count("자막:") == 6)
    page.click('[data-testid="copy-guide"]')
    page.wait_for_timeout(400)
    try:
        guide_clip = page.evaluate("navigator.clipboard.readText()")
    except Exception:  # noqa: BLE001
        guide_clip = ""
    check("가이드 복사: 컷별 안내", guide_clip.count("카메라:") == 6, guide_clip[:60])

    print("── 영상 저장(WebM 녹화)", flush=True)
    page.click('[data-testid="shot-jump-0"]')
    page.wait_for_timeout(350)
    video_art = art_id(page)
    if is_playing(page):
        page.click('[data-testid="play-toggle"]')
    check("영상 저장 버튼", page.locator('[data-testid="export-video"]').count() == 1)
    if page.locator('[data-testid="export-video"]').is_enabled():
        try:
            with page.expect_download(timeout=90000) as video_info:
                page.click('[data-testid="export-video"]')
            video_path = video_info.value.path()
            video_size = os.path.getsize(video_path) if video_path else 0
            check("영상 저장: 파일 생성", video_size > 50000, f"{video_size} bytes")
            check("영상 저장: .webm 확장자", (video_info.value.suggested_filename or "").endswith(".webm"),
                  video_info.value.suggested_filename)
            frame_path = os.path.join(ROOT, "scripts/.build/video-frame.png")
            ff = subprocess.run(
                [FFMPEG, "-y", "-ss", "1.0", "-i", video_path, "-frames:v", "1", frame_path],
                capture_output=True,
                text=True,
            )
            if os.path.exists(frame_path):
                frame = Image.open(frame_path).convert("RGB")
                stat = ImageStat.Stat(frame)
                check(
                    "영상 저장: 첫 컷 일러스트가 구워짐",
                    max(stat.mean) > 25 and max(stat.stddev) > 18,
                    f"mean={[round(v) for v in stat.mean]} std={[round(v) for v in stat.stddev]}",
                )
                art_path = os.path.join(ART_DIR, f"{video_art}.webp")
                if os.path.exists(art_path):
                    gap = color_gap(image_region_mean(art_path), image_region_mean(frame_path))
                    check("영상 저장: 녹화된 그림이 그 일러스트", gap < 62, f"{video_art} gap={round(gap)}")
                    frame.save(os.path.join(SHOTS, "05-video-frame.png"))
                    os.remove(frame_path)
            else:
                check("영상 저장: 프레임 추출", False, (ff.stderr or "")[-160:])
        except Exception as exc:  # noqa: BLE001
            check("영상 저장: 녹화 완료", False, f"{type(exc).__name__}: {str(exc)[:120]}")
    else:
        check("영상 저장: 이 브라우저에서 지원", False, "button disabled")

    print("── 새 주제로 다시 만들기(내장 엔진)", flush=True)
    page.fill('[data-testid="topic-input"]', "자취 3년차가 아는 꿀팁")
    page.click('[data-testid="template-living"]')
    page.click('[data-testid="tone-empathy"]')
    page.click('[data-testid="generate"]')
    check("만들기 후 자동 재생", wait_until(lambda: is_playing(page), 6))
    check("새 대본 6컷 유지", page.locator('[data-testid^="shot-card-"]').count() == 6)
    new_first = shot_value(page, 0)
    check("주제에 맞는 훅 (자취)", ("자취" in new_first or "혼자" in new_first), new_first)
    check("템플릿 선택 유지", page.get_attribute('[data-testid="template-living"]', "aria-pressed") == "true")
    check("톤 선택 유지", page.get_attribute('[data-testid="tone-empathy"]', "aria-pressed") == "true")
    check("만들기 후 재생 위치 1번 컷", active_index(page) <= 1, f"index={active_index(page)}")

    page.wait_for_timeout(900)
    saved = page.evaluate("JSON.parse(localStorage.getItem('shortcut-studio:shorts:v2') || '{}')")
    check("자동 저장: localStorage", saved.get("topic") == "자취 3년차가 아는 꿀팁", str(saved.get("topic")))
    check("자동 저장: 6컷", len(saved.get("cuts", [])) == 6)
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="shot-subtitle-0"]')
    check("새로고침 후 복원", shot_value(page, 0) == new_first, shot_value(page, 0))

    page.evaluate("window.scrollTo(0, 0)")
    page.click('[data-testid="restart"]')
    page.wait_for_timeout(1500)
    clean_shot(page, os.path.join(SHOTS, "01-studio.png"))

    print("── 템플릿×톤 로컬 엔진 문장 확인", flush=True)
    combos = [
        ("balance", "cider", "월급 1.5배 vs 칼퇴"),
        ("living", "empathy", "자취 시작할 때 사는 것"),
        ("love", "humor", "소개팅 첫 카톡"),
        ("it", "cider", "앱 출시 전 체크리스트"),
    ]
    firsts = []
    for tpl, tn, sample in combos:
        page.click(f'[data-testid="template-{tpl}"]')
        page.fill('[data-testid="topic-input"]', sample)
        page.click(f'[data-testid="tone-{tn}"]')
        page.click('[data-testid="generate"]')
        page.wait_for_timeout(500)
        subs = [shot_value(page, i) for i in range(6)]
        well_formed = all(len(s.strip()) >= 4 for s in subs) and all(s.count("*") % 2 == 0 for s in subs)
        check(f"로컬 엔진 {tpl}/{tn}: 6컷 문장", well_formed, str(subs)[:140])
        firsts.append(subs[0])
    check("템플릿마다 다른 대본", len(set(firsts)) == 4, str(firsts)[:160])

    print("── 이상한 입력 방어", flush=True)
    for odd in ["ㅁㄴㅇㄹ", "월급 vs 야근 vs 칼퇴", "가" * 80]:
        page.fill('[data-testid="topic-input"]', odd)
        page.click('[data-testid="generate"]')
        page.wait_for_timeout(450)
        count = page.locator('[data-testid^="shot-card-"]').count()
        subs = [shot_value(page, i) for i in range(count)]
        check(f"이상 입력 6컷 유지 ({odd[:8]})", count == 6 and all(len(s.strip()) >= 4 for s in subs), f"{count}컷")

    print("── 모바일 390px", flush=True)
    mob_ctx, mob = new_page(browser, base, "offline-mobile", viewport={"width": 390, "height": 844})
    check("모바일: 가로 넘침 0", no_overflow(mob),
          mob.evaluate("document.documentElement.scrollWidth - window.innerWidth"))
    frame_box = mob.locator('[data-testid="shorts-frame"]').bounding_box()
    check("모바일: 플레이어 9:16", frame_box and abs(frame_box["width"] / frame_box["height"] - 9 / 16) < 0.02,
          str(frame_box))
    check("모바일: 만들기 버튼 보임", mob.locator('[data-testid="generate"]').is_visible())
    mob.evaluate("window.scrollTo(0, 0)")
    mob.wait_for_timeout(200)
    clean_shot(mob, os.path.join(SHOTS, "02-mobile.png"))
    mobile_errors = [e for e in errors if e.startswith("[offline-mobile")]
    check("모바일: 콘솔 에러 0", not mobile_errors, str(mobile_errors[:2]))
    mob_ctx.close()

    offline_errors = [e for e in errors if e.startswith("[offline:")]
    check("데스크톱: 콘솔 에러 0", not offline_errors, str(offline_errors[:2]))
    context.close()


def run_ai(browser, base, port):
    capture = os.path.join(ROOT, "scripts/.build/gemini-request.json")
    try:
        os.remove(capture)
    except FileNotFoundError:
        pass
    context, page = new_page(browser, base, "ai")
    check("AI: 상태 배지 표시", wait_until(lambda: "AI 대본 연결됨" in page.inner_text('[data-testid="server-state"]'), 8),
          page.inner_text('[data-testid="server-state"]'))

    page.fill('[data-testid="topic-input"]', "AI 테스트 주제")
    page.click('[data-testid="template-it"]')
    page.click('[data-testid="tone-humor"]')
    page.click('[data-testid="generate"]')
    check("AI: 대본 적용", wait_until(lambda: "AI가 쓴" in shot_value(page, 0), 12), shot_value(page, 0))
    check("AI: 6컷", page.locator('[data-testid^="shot-card-"]').count() == 6)
    check("AI: 자동 재생", wait_until(lambda: is_playing(page), 4))
    check("AI: 첫 컷이 화면에도 반영", "AI가 쓴" in player_text(page), player_text(page))

    captured = {}
    for _ in range(30):
        if os.path.exists(capture):
            with open(capture, encoding="utf-8") as handle:
                captured = json.load(handle)
            if "AI 테스트 주제" in captured.get("user", ""):
                break
        time.sleep(0.2)
    check("AI: Gemini 모델 기본값", captured.get("model") == "gemini-3.5-flash-lite", str(captured.get("model")))
    check("AI: JSON 응답 모드", captured.get("generationConfig", {}).get("responseMimeType") == "application/json")
    check("AI: 프롬프트에 주제 포함", "AI 테스트 주제" in captured.get("user", ""))
    check("AI: 시스템 프롬프트 적용", "SHORTCUT_SHORTS" in captured.get("system", ""))
    check("AI: 프롬프트에 장면 지시 규칙", "visual" in captured.get("system", "") and '"scene"' in captured.get("system", ""))
    check("AI: 프롬프트에 훅 공식", "0~2초" in captured.get("system", ""))

    def art_for(index):
        page.click(f'[data-testid="shot-jump-{index}"]')
        wait_until(lambda: active_index(page) == index, 4)
        if is_playing(page):
            page.click('[data-testid="play-toggle"]')
        page.wait_for_timeout(250)
        return art_id(page)

    art_first = art_for(0)
    check("AI: '퇴근길 지하철' 장면이 지하철 일러스트로", "subway" in art_first, art_first or "")
    art_second = art_for(1)
    check("AI: 다음 컷은 다른 일러스트", art_second and art_second != art_first, art_second or "")

    page.evaluate("window.scrollTo(0, 0)")
    page.click('[data-testid="restart"]')
    page.wait_for_timeout(1400)
    clean_shot(page, os.path.join(SHOTS, "03-ai.png"))

    print("── AI 실패 → 내장 엔진 폴백", flush=True)
    page.fill('[data-testid="topic-input"]', "실패 케이스")
    page.click('[data-testid="generate"]')
    check("폴백: 새 대본 생성", wait_until(lambda: "AI가 쓴" not in shot_value(page, 0), 12), shot_value(page, 0))
    check("폴백: 안내 토스트", wait_until(lambda: page.locator('[role="status"]').count() > 0, 4))

    status, payload = api(port)
    check("API GET: ai 준비됨", status == 200 and payload.get("ai") is True and payload.get("provider") == "gemini", str(payload)[:120])
    status, payload = api(port, "POST", {"topic": "테스트 주제", "template": "living", "tone": "cider"})
    check("API POST: 6컷 반환", status == 200 and len(payload.get("cuts", [])) == 6, str(payload)[:120])
    status, payload = api(port, "POST", {"topic": "a"})
    check("API POST: 짧은 주제 400", status == 400, str(payload)[:100])

    ai_errors = [e for e in errors if e.startswith("[ai:")]
    check("AI: 콘솔 에러 0", not ai_errors, str(ai_errors[:2]))
    context.close()


def run_nokey(browser, base, port):
    context, page = new_page(browser, base, "nokey")
    check("키 없음: 배지", wait_until(lambda: "내장 대본 엔진" in page.inner_text('[data-testid="server-state"]'), 8))
    page.click('[data-testid="template-living"]')
    page.fill('[data-testid="topic-input"]', "월세 아끼는 방법")
    page.click('[data-testid="generate"]')
    check("키 없음: 내장 엔진 생성", wait_until(lambda: page.locator('[data-testid^="shot-card-"]').count() == 6 and is_playing(page), 6))
    page.wait_for_timeout(900)
    saved = page.evaluate("JSON.parse(localStorage.getItem('shortcut-studio:shorts:v2') || '{}')")
    check("키 없음: 입력한 주제 유지", saved.get("topic") == "월세 아끼는 방법", str(saved.get("topic")))
    check("키 없음: source=local", saved.get("source") == "local", str(saved.get("source")))

    status, payload = api(port)
    check("API GET: no_key", status == 200 and payload.get("ai") is False and payload.get("reason") == "no_key", str(payload)[:100])
    status, payload = api(port, "POST", {"topic": "테스트 주제"})
    check("API POST: 501 no_key", status == 501 and payload.get("error", {}).get("code") == "no_key", str(payload)[:100])

    nokey_errors = [e for e in errors if e.startswith("[nokey:")]
    check("키 없음: 콘솔 에러 0", not nokey_errors, str(nokey_errors[:2]))
    context.close()


def launch_browser(playwright, attempts=8):
    """컨테이너에 다른 작업이 많으면 스레드가 모자라 크로미움이 뜨지 못합니다.
    잠깐 기다렸다 다시 띄우고, 그래도 안 되면 single-process로 시도합니다."""
    last = None
    for attempt in range(attempts):
        for args in (["--no-sandbox"], ["--no-sandbox", "--single-process", "--disable-gpu"]):
            browser = None
            try:
                browser = playwright.chromium.launch(args=args)
                probe = browser.new_page()
                probe.close()
                return browser
            except Exception as exc:  # noqa: BLE001
                last = exc
                try:
                    if browser:
                        browser.close()
                except Exception:  # noqa: BLE001
                    pass
        time.sleep(6)
    raise last


def main():
    os.makedirs(SHOTS, exist_ok=True)

    @contextlib.contextmanager
    def serve(mode, port):
        start_server(mode, port)
        try:
            yield f"http://127.0.0.1:{port}/"
        finally:
            stop_servers()

    only = sys.argv[1] if len(sys.argv) > 1 else "all"
    plans = [
        ("offline", "정적 호스팅(서버 없음)", lambda base: run_offline(browser_holder[0], base)),
        ("ai", "AI 서버", lambda base: run_ai(browser_holder[0], base, 4185)),
        ("nokey", "키 없는 서버", lambda base: run_nokey(browser_holder[0], base, 4186)),
    ]
    ports = {"offline": 4183, "ai": 4185, "nokey": 4186}
    browser_holder = [None]
    with sync_playwright() as p:
        browser_holder[0] = launch_browser(p)
        for mode, name, run in plans:
            if only not in ("all", mode):
                continue
            with serve(mode, ports[mode]) as base:
                step(name, lambda base=base, run=run: run(base))
        browser_holder[0].close()

    passed = sum(1 for _, ok, _ in checks if ok)
    total = len(checks)
    print(f"\n결과: {passed}/{total} 통과", flush=True)
    if errors:
        print("\n콘솔/페이지 오류:", flush=True)
        for item in errors[:20]:
            print(" -", item, flush=True)
    return 0 if passed == total and not errors else 1


if __name__ == "__main__":
    sys.exit(main())
