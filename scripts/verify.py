"""
숏컷 스튜디오 v2 E2E 검증.

검사 범위
  · 첫 화면: 입력 1개 · 템플릿 4개 · 톤 3개 · 만들기 버튼 1개 (복잡한 패널 없음)
  · 모션 일러스트: 캔버스가 실제로 그려지고 계속 움직임 · 컷마다 장면이 다름 · 새로 만들면 장면이 바뀜
  · 재생: 재생 버튼 → 컷이 실제로 넘어감(active index 증가) · 컷마다 한국어 음성 호출(ko-KR)
  · 영상 저장: 움직이는 화면이 WebM으로 녹화되어 내려받아짐
  · 수정: 컷 자막 인라인 수정 반영 · 컷 순서 변경
  · 내보내기: 대본 복사(클립보드) · .srt 저장(6블록) · 컷별 가이드 저장
  · AI 서버: 상태 배지, AI 대본 적용, 응답 실패 시 내장 엔진 폴백
  · 서버 없음(정적 호스팅): 내장 엔진으로 즉시 동작
  · 모바일 390px: 가로 넘침 0 · 콘솔 에러 0
"""

import os, re, json, subprocess, sys, time, socket, atexit, urllib.request, urllib.error

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/workspace/.cache/ms-playwright")
os.environ["LD_LIBRARY_PATH"] = "/workspace/.libs/usr/lib/x86_64-linux-gnu" + (
    (":" + os.environ["LD_LIBRARY_PATH"]) if os.environ.get("LD_LIBRARY_PATH") else ""
)
from playwright.sync_api import sync_playwright

ROOT = "/workspace/projects/shorts-assembly-studio"
NODE = "/workspace/.tools/node-v22.12.0-linux-x64/bin/node"
SHOTS = os.path.join(ROOT, "docs/screenshots")

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


def shot_value(page, index):
    return page.input_value(f'[data-testid="shot-subtitle-{index}"]')


def no_overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 0


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

    print("── 모션 일러스트 캔버스", flush=True)
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
    check("모션 캔버스: 여러 색으로 그려짐", painted.get("colors", 0) > 12, str(painted))
    check("모션 캔버스: 9:16 픽셀", painted.get("h", 0) > painted.get("w", 0) * 1.7, str(painted))

    page.click('[data-testid="play-toggle"]')
    page.wait_for_timeout(320)
    frame_a = page.locator('[data-testid="shorts-frame"]').screenshot()
    page.wait_for_timeout(430)
    frame_b = page.locator('[data-testid="shorts-frame"]').screenshot()
    check("모션: 재생 중 화면이 계속 움직임", frame_a != frame_b, f"{len(frame_a)} / {len(frame_b)} bytes")
    page.click('[data-testid="play-toggle"]')

    scene_by_cut = []
    for index in range(6):
        page.click(f'[data-testid="shot-jump-{index}"]')
        page.wait_for_timeout(260)
        scene_by_cut.append(page.get_attribute('[data-testid="motion-canvas"]', "data-scene") or "")
        page.click('[data-testid="play-toggle"]')
    check("모션: 컷마다 장면이 다름", len(set(scene_by_cut)) >= 3, str(scene_by_cut))
    check("모션: 장면 이름 표시", len(page.inner_text('[data-testid="scene-label"]')) > 4)

    page.fill('[data-testid="topic-input"]', "월급 1.5배 vs 칼퇴")
    page.click('[data-testid="generate"]')
    page.wait_for_timeout(600)
    first_scene = page.get_attribute('[data-testid="motion-canvas"]', "data-scene")
    first_pixels = page.locator('[data-testid="shorts-frame"]').screenshot()
    page.wait_for_timeout(300)
    page.click('[data-testid="generate"]')
    page.wait_for_timeout(600)
    second_scene = page.get_attribute('[data-testid="motion-canvas"]', "data-scene")
    second_pixels = page.locator('[data-testid="shorts-frame"]').screenshot()
    check("모션: 다시 만들면 같은 주제도 다른 장면", first_pixels != second_pixels or first_scene != second_scene,
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

    page.wait_for_timeout(900)
    page.screenshot(path=os.path.join(SHOTS, "01-studio.png"), full_page=True)

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
    mob.screenshot(path=os.path.join(SHOTS, "02-mobile.png"), full_page=True)
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

    def scene_for(index):
        page.click(f'[data-testid="shot-jump-{index}"]')
        wait_until(lambda: active_index(page) == index, 4)
        value = page.get_attribute('[data-testid="motion-canvas"]', "data-scene")
        if is_playing(page):
            page.click('[data-testid="play-toggle"]')
        page.wait_for_timeout(150)
        return value

    scene_first = scene_for(0)
    check("AI: 장면 지시가 그림에 반영", scene_first == "subway", scene_first or "")
    scene_second = scene_for(1)
    check("AI: 컷마다 다른 장면", scene_second == "office", scene_second or "")

    page.screenshot(path=os.path.join(SHOTS, "03-ai.png"), full_page=True)

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


def main():
    os.makedirs(SHOTS, exist_ok=True)
    start_server("offline", 4183)
    start_server("ai", 4185)
    start_server("nokey", 4186)

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        step("정적 호스팅(서버 없음)", lambda: run_offline(browser, "http://127.0.0.1:4183/"))
        step("AI 서버", lambda: run_ai(browser, "http://127.0.0.1:4185/", 4185))
        step("키 없는 서버", lambda: run_nokey(browser, "http://127.0.0.1:4186/", 4186))
        browser.close()

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
