"""
숏컷 스튜디오 v2 E2E 검증.

검사 범위
  · 첫 화면: 입력 1개 · 템플릿 4개 · 톤 3개 · 만들기 버튼 1개 (복잡한 패널 없음)
  · 대본: 8~12컷 완성형(후킹→전개→반전→CTA)·35~60초·컷마다 자막과 나레이션 문장이 따로 있음
  · 웹툰 일러스트: 모든 컷이 다른 일러스트로 실제로 로드·드로잉됨(색 대조) · 계속 움직임 · 새로 만들면 바뀜
  · 재생: 재생 버튼 → 컷이 실제로 넘어감(active index 증가) · 컷마다 한국어 음성 호출(ko-KR)
  · 영상 저장: 움직이는 화면이 WebM으로 녹화되어 내려받아짐
  · 수정: 컷 자막 인라인 수정 반영 · 컷 순서 변경
  · 내보내기: 대본 복사(클립보드) · .srt 저장(컷 수만큼) · 컷별 가이드 저장
  · 나레이션: 2~4컷을 한 호흡으로 이어 읽음(블록 < 컷) · 화자 스타일 · 덕킹 · 내 목소리(녹음·파일) · 음성 길이에 컷 자동 맞춤
  · AI 서버: 상태 배지, AI 대본 적용, 응답 실패 시 내장 엔진 폴백
  · 서버 없음(정적 호스팅): 내장 엔진으로 즉시 동작
  · 모바일 390px: 가로 넘침 0 · 콘솔 에러 0
"""

import os, re, json, math, subprocess, sys, time, socket, atexit, contextlib, urllib.request, urllib.parse, urllib.error

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
  // 마이크가 없는 검증 환경 — 권한 거부를 실제 브라우저와 같은 문장으로 돌려줍니다.
  window.__micAsked = 0;
  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = async () => {
      window.__micAsked += 1;
      throw new DOMException('Permission denied', 'NotAllowedError');
    };
  }
})();
"""


TTS_CALLS = os.path.join(ROOT, "scripts/.build/tts-calls.jsonl")


def reset_tts_log():
    try:
        os.remove(TTS_CALLS)
    except FileNotFoundError:
        pass


def tts_calls():
    calls = []
    try:
        with open(TTS_CALLS, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if line:
                    calls.append(json.loads(line))
    except FileNotFoundError:
        return []
    return calls


def tts_api(port, text, provider=None):
    """GET /api/tts — 상태 JSON 또는 음성 바이트(길이만 확인). 제공자 헤더도 함께 돌려줍니다."""
    params = []
    if text:
        params.append(f"text={urllib.parse.quote(text)}")
    if provider:
        params.append(f"provider={provider}")
    query = ("?" + "&".join(params)) if params else ""
    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/tts{query}", method="GET")
    try:
        with urllib.request.urlopen(req) as res:
            body = res.read()
            ctype = res.headers.get("content-type", "")
            if "json" in ctype:
                return res.status, json.loads(body.decode() or "{}")
            return res.status, {
                "bytes": len(body),
                "type": ctype,
                "cached": "immutable" in (res.headers.get("cache-control") or ""),
                "provider": res.headers.get("x-tts-provider") or "",
            }
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode() or "{}")


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


def cut_count(page):
    value = page.get_attribute('[data-testid="shorts-frame"]', "data-cuts")
    if value and value.isdigit():
        return int(value)
    return page.locator('[data-testid^="shot-card-"]').count()


def block_count(page):
    value = page.get_attribute('[data-testid="tts-status"]', "data-blocks")
    return int(value) if value and value.isdigit() else 0


def narration_seconds(page):
    value = page.get_attribute('[data-testid="shorts-frame"]', "data-narration-seconds")
    try:
        return float(value or 0)
    except ValueError:
        return 0.0


def voices(page):
    return page.evaluate(
        "() => [...document.querySelectorAll('[data-testid^=\"shot-voice-text-\"]')].map(e => e.value)"
    )


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
    for index in range(cut_count(page)):
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


def render_at(page, at, level=None):
    """같은 시각이면 항상 같은 프레임 — 결정적으로 한 장을 그립니다."""
    if level:
        page.evaluate(f"window.__shortcutRenderAt({at}, '{level}')")
    else:
        page.evaluate(f"window.__shortcutRenderAt({at})")
    page.wait_for_timeout(70)


def frame_probe(page):
    return page.evaluate("({...window.__shortcutFrame})")


def canvas_pixels(page):
    return page.evaluate(
        """() => {
          const canvas = document.querySelector('[data-testid="motion-canvas"]');
          const ctx = canvas.getContext('2d');
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          const out = [];
          for (let i = 0; i < data.length; i += 4 * 29) out.push(data[i], data[i + 1], data[i + 2]);
          return out;
        }"""
    )


def pixel_diff(a, b):
    n = min(len(a), len(b))
    if n < 3:
        return {"mean": 0.0, "pct": 0.0}
    total = 0
    changed = 0
    for i in range(0, n, 3):
        delta = abs(a[i] - b[i]) + abs(a[i + 1] - b[i + 1]) + abs(a[i + 2] - b[i + 2])
        total += delta
        if delta > 14:
            changed += 1
    return {"mean": round(total / (n / 3) / 3, 2), "pct": round(100 * changed / (n / 3), 1)}


def video_frame(page, at, path):
    """저장된 영상(blob)에서 원하는 시각의 한 프레임을 꺼내 파일로 저장합니다.
    MediaRecorder의 WebM은 길이 헤더가 없어 ffmpeg 탐색이 실패할 수 있어, 브라우저로 디코드합니다."""
    import base64

    payload = page.evaluate(
        """async (at) => {
          const rec = window.__shortcutLastExport;
          if (!rec) return { ok: false, reason: 'no export' };
          const url = URL.createObjectURL(rec.blob);
          const video = document.createElement('video');
          video.src = url;
          video.muted = true;
          video.playsInline = true;
          await new Promise((resolve) => {
            video.onloadeddata = resolve;
            video.onerror = resolve;
            video.load();
            setTimeout(resolve, 4000);
          });
          const duration = Number.isFinite(video.duration) ? video.duration : 0;
          const target = duration > 0 ? Math.min(at, Math.max(0, duration - 0.1)) : at;
          if (target > 0.02) {
            // MediaRecorder의 WebM은 탐색(cue)이 없어 currentTime 이동이 엉뚱한 프레임으로 갑니다.
            // 실제로 조금 재생한 뒤 멈춰 그 순간을 그립니다.
            try {
              await video.play();
              await new Promise((resolve) => setTimeout(resolve, Math.round(target * 1000)));
              video.pause();
            } catch (e) { /* 재생을 못 하면 첫 프레임 */ }
          }
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          if (!canvas.width || !canvas.height) { URL.revokeObjectURL(url); return { ok: false, reason: 'no size' }; }
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          const data = canvas.toDataURL('image/png');
          URL.revokeObjectURL(url);
          return { ok: true, width: canvas.width, height: canvas.height, duration, data };
        }""",
        at,
    )
    if not payload or not payload.get("ok"):
        return None, (payload or {}).get("reason", "frame fail")
    raw = payload["data"].split(",", 1)[1] if "," in payload["data"] else payload["data"]
    with open(path, "wb") as handle:
        handle.write(base64.b64decode(raw))
    return payload, ""


def bright_ratio(path, top, bottom):
    """영상 프레임의 일정 영역에서 아주 밝은(자막·배너) 픽셀 비율."""
    image = Image.open(path).convert("RGB")
    width, height = image.size
    crop = image.crop((0, int(height * top), width, int(height * bottom)))
    pixels = list(crop.getdata())
    bright = sum(1 for r, g, b in pixels if min(r, g, b) > 232)
    return bright / max(1, len(pixels))


def region_bright(path, y0, y1, threshold=150):
    """영상 프레임의 세로 구간에서 밝은 픽셀 비율(플랫폼 표식처럼 옅은 흰색까지 포함)."""
    image = Image.open(path).convert("RGB")
    width, height = image.size
    crop = image.crop((0, int(height * y0), width, int(height * y1)))
    pixels = list(crop.getdata())
    bright = sum(1 for r, g, b in pixels if min(r, g, b) > threshold)
    return bright / max(1, len(pixels))


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


def hero_shot(page, path):
    """대표 화면 — 재생을 멈추고 재생 오버레이를 숨긴 뒤, 자막이 다 뜬 프레임으로 한 장."""
    page.click('[data-testid="shot-jump-0"]')
    page.wait_for_timeout(300)
    pause_video(page)
    page.add_style_tag(content=".pause-overlay{display:none !important} header{position:static !important}")
    page.evaluate("window.__shortcutRenderAt && window.__shortcutRenderAt(1.2)")
    page.wait_for_timeout(500)
    page.screenshot(path=path, full_page=True)


def clean_shot(page, path):
    """sticky 헤더가 페이지 중간에 찍히지 않도록 잠깐 static으로 바꿔 찍습니다."""
    page.add_style_tag(content="header{position:static !important}")
    page.wait_for_timeout(150)
    page.screenshot(path=path, full_page=True)


def compose_cuts(count=10):
    """모든 컷을 한 장으로 — 컷마다 다른 일러스트를 한눈에."""
    paths = [os.path.join(SHOTS, f"cut-{index}.png") for index in range(1, count + 1)]
    if not all(os.path.exists(path) for path in paths):
        return
    width, height = 176, 313
    gap = 8
    sheet = Image.new("RGB", (count * width + (count + 1) * gap, height + 2 * gap), (10, 9, 16))
    for index, path in enumerate(paths):
        image = Image.open(path).convert("RGB").resize((width, height))
        sheet.paste(image, (gap + index * (width + gap), gap))
    sheet.save(os.path.join(SHOTS, "04-scenes.png"))


def render_region(page, at=0.4, x0=0.15, y0=0.12, x1=0.85, y1=0.57):
    """한 프레임을 그리고 같은 호출 안에서 바로 픽셀을 읽습니다(재생 루프와 경쟁하지 않음)."""
    return page.evaluate(
        """([at, x0, y0, x1, y1]) => {
          const hasHook = typeof window.__shortcutRenderAt === 'function';
          if (hasHook) window.__shortcutRenderAt(at);
          const c = document.querySelector('[data-testid="motion-canvas"]');
          const ctx = c.getContext('2d');
          const sx = Math.floor(c.width * x0), sy = Math.floor(c.height * y0);
          const w = Math.max(1, Math.floor(c.width * (x1 - x0)));
          const h = Math.max(1, Math.floor(c.height * (y1 - y0)));
          const d = ctx.getImageData(sx, sy, w, h).data;
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < d.length; i += 4 * 41) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n += 1; }
          const probe = { ...(window.__shortcutFrame || {}) };
          return {
            mean: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
            hook: hasHook,
            index: probe.index,
            time: probe.time === undefined ? null : Math.round(probe.time * 100) / 100,
            warp: probe.warp === undefined ? null : Math.round(probe.warp * 10) / 10,
            art: c.dataset.art,
          };
        }""",
        [at, x0, y0, x1, y1],
    )


def project_seconds(page):
    text = page.inner_text('[data-testid="project-summary"]')
    match = re.search(r"약 ([\d.]+)초", text)
    return float(match.group(1)) if match else -1.0


def set_range(page, selector, value):
    """range input은 el.value만 바꾸면 React가 못 알아챕니다 — 원래 setter로 값를 넣고 input을 보냅니다."""
    page.eval_on_selector(
        selector,
        """(el, value) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(el, String(value));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }""",
        value,
    )


def pause_video(page):
    """재생 중이면 멈추고, 확실히 멈춘 상태가 될 때까지 기다립니다."""
    for _ in range(3):
        if not is_playing(page):
            return True
        page.click('[data-testid="play-toggle"]')
        if wait_until(lambda: not is_playing(page), 3):
            return True
    return not is_playing(page)


def ensure_sound_on(page):
    if page.get_attribute('[data-testid="sound-toggle"]', 'aria-pressed') == 'false':
        page.click('[data-testid="sound-toggle"]')
        page.wait_for_timeout(200)


def open_tab(page, tab):
    """오른쪽 인스펙터 탭(오디오·TTS / 자막·브랜드 / 내보내기)을 엽니다."""
    sel = f'[data-testid="inspector-tab-{tab}"]'
    if page.get_attribute(sel, "data-active") != "true":
        page.click(sel)
        page.wait_for_timeout(200)


def audio_stats(page):
    return page.evaluate("({ ...(window.__shortcutAudio || {}) })")


def export_record(page):
    """마지막 저장 영상 — 브라우저 안에서 파일을 다시 풀어 실제 소리를 재 봅니다."""
    return page.evaluate(
        """async () => {
          const r = window.__shortcutLastExport;
          if (!r) return null;
          const buf = await r.blob.arrayBuffer();
          const ctx = new AudioContext();
          let rms = 0, peak = 0, seconds = 0;
          try {
            const decoded = await ctx.decodeAudioData(buf.slice(0));
            const data = decoded.getChannelData(0);
            let sum = 0, n = 0;
            for (let i = 0; i < data.length; i += 7) {
              const v = Math.abs(data[i]);
              if (v > peak) peak = v;
              sum += v * v;
              n += 1;
            }
            rms = Math.sqrt(sum / Math.max(1, n));
            seconds = decoded.duration;
          } catch (e) { /* 오디오 트랙 없음 */ }
          await ctx.close();
          return {
            withAudio: r.withAudio, narratedCuts: r.narratedCuts, format: r.format,
            width: r.width, height: r.height, size: r.blob.size, rms, peak, seconds,
          };
        }"""
    )


def emoji_chars(page):
    return page.evaluate(
        r"""() => {
          const re = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
          return [...(document.body.innerText || '')].filter((ch) => re.test(ch)).slice(0, 8);
        }"""
    )


def column_left(page, selector):
    box = page.locator(selector).first.bounding_box()
    return round(box["x"]) if box else -1


def canvas_strip(page, x0=0.25, x1=0.75, y0=0.94, y1=0.99):
    """캔버스 아래 가운데 띠(플랫폼 표식 자리)의 픽셀 — Free/Pro 비교용."""
    return page.evaluate(
        """([x0, x1, y0, y1]) => {
          const c = document.querySelector('[data-testid="motion-canvas"]');
          const ctx = c.getContext('2d');
          const sx = Math.floor(c.width * x0), sy = Math.floor(c.height * y0);
          const w = Math.max(1, Math.floor(c.width * (x1 - x0)));
          const h = Math.max(1, Math.floor(c.height * (y1 - y0)));
          const d = ctx.getImageData(sx, sy, w, h).data;
          const out = [];
          for (let i = 0; i < d.length; i += 4 * 2) out.push(d[i], d[i + 1], d[i + 2]);
          return out;
        }""",
        [x0, x1, y0, y1],
    )


def strip_bright(pixels):
    if not pixels:
        return 0.0
    n = len(pixels) // 3
    bright = sum(1 for i in range(0, len(pixels), 3) if min(pixels[i], pixels[i + 1], pixels[i + 2]) > 165)
    return bright / max(1, n)


def canvas_region_bright(page, y0=0.92, y1=0.995):
    """캔버스 아래쪽(플랫폼 표식 자리)의 밝은 픽셀 비율."""
    return page.evaluate(
        """([y0, y1]) => {
          const c = document.querySelector('[data-testid="motion-canvas"]');
          const ctx = c.getContext('2d');
          const sy = Math.floor(c.height * y0);
          const h = Math.max(1, Math.floor(c.height * (y1 - y0)));
          const d = ctx.getImageData(0, sy, c.width, h).data;
          let bright = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 170 && d[i + 1] > 170 && d[i + 2] > 170) bright += 1;
            n += 1;
          }
          return bright / Math.max(1, n);
        }""",
        [y0, y1],
    )


def make_test_image(path):
    """컷에 올릴 내 사진 — 색으로 쉽게 구분되게 단색 배경 + 도형."""
    from PIL import ImageDraw

    image = Image.new("RGB", (900, 1600), (238, 86, 128))
    draw = ImageDraw.Draw(image)
    # 가운데 작은 표식만 — 화면 어느 부분을 재도 분홍이 나오게(카메라가 확대해도 같은 색).
    draw.ellipse([390, 700, 510, 820], fill=(255, 255, 255))
    image.save(path)


def run_studio_extras(page):
    """상용 고도화분 — 프리셋·배경음·자막 테마·내 이미지·워터마크·세이프존·드래프트."""
    print("── 원클릭 상용 프리셋", flush=True)
    check("프리셋 4종", page.locator('[data-testid^="preset-"]').count() == 4)
    page.click('[data-testid="preset-issue-60"]')
    page.wait_for_timeout(600)
    check("프리셋: 10컷 구성", page.locator('[data-testid^="shot-card-"]').count() == 10)
    seconds = project_seconds(page)
    check("프리셋: 60초 요약 구성", seconds > 45, f"{seconds}초")
    check("프리셋: 배경음 자동 선택(긴장)",
          page.get_attribute('[data-testid="shorts-frame"]', "data-audio") == "tension",
          page.get_attribute('[data-testid="shorts-frame"]', "data-audio"))
    check("프리셋: 대본이 프리셋 문장", "세 줄" in shot_value(page, 0), shot_value(page, 0))

    page.click('[data-testid="preset-review"]')
    page.wait_for_timeout(500)
    open_tab(page, "caption")
    check("프리셋: 리뷰 자막 테마(미니멀) 적용",
          page.get_attribute('[data-testid="caption-theme-minimal"]', "aria-pressed") == "true")
    short_seconds = project_seconds(page)
    check("프리셋: 리뷰는 30~60초 숏폼", 30 < short_seconds < 60, f"{short_seconds}초")

    print("── 배경음(BGM)", flush=True)
    open_tab(page, "audio")
    ensure_sound_on(page)
    for mood in ("off", "trendy", "romance", "tension", "comic"):
        check(f"배경음: {mood} 버튼", page.locator(f'[data-testid="bgm-{mood}"]').count() == 1)
    page.click('[data-testid="bgm-romance"]')
    check("배경음: 무드 변경 반영",
          wait_until(lambda: page.get_attribute('[data-testid="shorts-frame"]', "data-audio") == "romance", 2))
    set_range(page, '[data-testid="bgm-volume"]', 20)
    page.wait_for_timeout(900)
    saved_audio = page.evaluate("JSON.parse(localStorage.getItem('shortcut-studio:shorts:v2')||'{}').audio")
    check("배경음: 볼륨 저장", bool(saved_audio) and abs(float(saved_audio.get("volume", 1)) - 0.2) < 0.01,
          str(saved_audio))
    page.click('[data-testid="bgm-mute"]')
    page.wait_for_timeout(900)
    muted = page.evaluate("JSON.parse(localStorage.getItem('shortcut-studio:shorts:v2')||'{}').audio.muted")
    check("배경음: 음소거 저장", muted is True, str(muted))
    page.click('[data-testid="bgm-mute"]')
    page.wait_for_timeout(900)
    unmuted = page.evaluate("JSON.parse(localStorage.getItem('shortcut-studio:shorts:v2')||'{}').audio.muted")
    check("배경음: 음소거 해제", unmuted is False, str(unmuted))
    page.click('[data-testid="bgm-trendy"]')
    page.wait_for_timeout(300)

    print("── 자막 스튜디오", flush=True)
    open_tab(page, "caption")
    render_at(page, 0.7)
    before = canvas_pixels(page)
    page.click('[data-testid="caption-theme-neon"]')
    page.wait_for_timeout(250)
    render_at(page, 0.7)
    changed = pixel_diff(before, canvas_pixels(page))
    check("자막: 테마를 바꾸면 화면도 바뀜", changed["pct"] > 0.2, str(changed))
    page.click('[data-testid="caption-size-l"]')
    page.wait_for_timeout(200)
    check("자막: 크기 크게 선택", page.get_attribute('[data-testid="caption-size-l"]', "aria-pressed") == "true")
    page.click('[data-testid="caption-pos-top"]')
    page.wait_for_timeout(200)
    check("자막: 위치 위 선택", page.get_attribute('[data-testid="caption-pos-top"]', "aria-pressed") == "true")
    page.click('[data-testid="caption-pos-bottom"]')
    page.click('[data-testid="caption-size-m"]')
    page.click('[data-testid="caption-theme-impact"]')
    page.wait_for_timeout(200)

    print("── 컷 길이·내 이미지·워터마크·세이프존", flush=True)
    page.click('[data-testid="preset-balance-game"]')
    page.wait_for_timeout(500)
    base_total = project_seconds(page)
    set_range(page, '[data-testid="shot-duration-0"]', 9)
    page.wait_for_timeout(400)
    longer = project_seconds(page)
    check("컷 길이: 늘리면 총 길이도 늘어남", longer > base_total + 2, f"{base_total} → {longer}")
    card_text = page.inner_text('[data-testid="shot-card-0"]')
    check("컷 길이: 카드에 초 표시", "9.0s" in card_text, card_text[:60])

    image_path = os.path.join(ROOT, "scripts/.build/custom-cut.png")
    make_test_image(image_path)
    page.click('[data-testid="shot-jump-0"]')
    wait_until(lambda: is_playing(page), 4)
    pause_video(page)
    page.set_input_files('[data-testid="shot-image-input-0"]', image_path)
    uploaded = wait_until(lambda: page.get_attribute('[data-testid="shot-art-0"]', "data-custom") == "true", 6)
    check("내 이미지: 컷 카드에 업로드", uploaded, page.get_attribute('[data-testid="shot-art-0"]', "data-custom"))
    check("내 이미지: 캔버스가 내 이미지로 그림", wait_until(lambda: art_id(page).startswith("img:"), 6), art_id(page))
    # 그림은 data URL을 읽어 오느라 한 박자 늦게 도착합니다 — 칠해질 때까지 기다립니다.
    # 재생이 멈춘 상태에서 1번 컷을 고정해 놓고 재 봅니다(재생 중이면 화면이 다음 컷으로 넘어갑니다).
    page.wait_for_timeout(600)
    pause_video(page)
    sample = render_region(page, 0.4)
    region = sample["mean"]
    check("내 이미지: 올린 색이 화면에 보임", region[0] > 110 and region[0] > region[1] * 1.3, str(sample))
    saved = wait_until(
        lambda: bool(
            page.evaluate("JSON.parse(localStorage.getItem('shortcut-studio:shorts:v2')||'{}').cuts?.[0]?.image")
        ),
        5,
    )
    saved_cut = page.evaluate("JSON.parse(localStorage.getItem('shortcut-studio:shorts:v2')||'{}').cuts?.[0]?.image")
    check("내 이미지: 컷에 참조로 저장", saved and bool(saved_cut.get("id")), str(saved_cut))

    render_at(page, 1.0)
    before_brand = canvas_pixels(page)
    page.click('[data-testid="brand-toggle"]')
    page.fill('[data-testid="brand-handle"]', "studio_test")
    page.wait_for_timeout(300)
    render_at(page, 1.0)
    after_brand = canvas_pixels(page)
    brand_diff = pixel_diff(before_brand, after_brand)
    check("브랜드: 워터마크가 캔버스에 그려짐", brand_diff["pct"] > 0.05, str(brand_diff))
    wait_until(lambda: bool(page.evaluate("(JSON.parse(localStorage.getItem('shortcut-studio:shorts:v2')||'{}').brand||{}).handle")), 4)
    saved_brand = page.evaluate("JSON.parse(localStorage.getItem('shortcut-studio:shorts:v2')||'{}').brand")
    check("브랜드: 핸들·켜짐 저장",
          bool(saved_brand) and saved_brand.get("handle") == "studio_test" and bool(saved_brand.get("enabled")),
          str(saved_brand))
    page.click('[data-testid="brand-corner-top-left"]')
    page.wait_for_timeout(250)
    render_at(page, 1.0)
    moved = pixel_diff(canvas_pixels(page), before_brand)
    check("브랜드: 자리 이동도 반영", moved["pct"] > 0.05, str(moved))

    check("세이프존: 기본 꺼짐", page.locator('[data-testid="safe-zone"]').count() == 0)
    render_at(page, 1.0)
    before_zone = canvas_pixels(page)
    page.click('[data-testid="safe-zone-toggle"]')
    check("세이프존: 오버레이 표시", wait_until(lambda: page.locator('[data-testid="safe-zone"]').count() == 1, 3))
    render_at(page, 1.0)
    zone_diff = pixel_diff(before_zone, canvas_pixels(page))
    check("세이프존: 영상(캔버스)에는 안 들어감", zone_diff["mean"] < 0.5, str(zone_diff))
    page.click('[data-testid="safe-zone-toggle"]')

    print("── 드래프트 저장·불러오기", flush=True)
    page.fill('[data-testid="shot-subtitle-0"]', "드래프트 확인용 자막")
    page.wait_for_timeout(300)
    page.fill('[data-testid="draft-name"]', "테스트 드래프트")
    page.click('[data-testid="draft-save"]')
    page.wait_for_timeout(400)
    page.click('[data-testid="drafts-toggle"]')
    check("드래프트: 목록에 저장됨", "테스트 드래프트" in page.inner_text('[data-testid="draft-list"]'),
          page.inner_text('[data-testid="draft-list"]')[:80])
    page.click('[data-testid="preset-love-story"]')
    page.wait_for_timeout(400)
    check("드래프트: 다른 프리셋으로 갈아탐", shot_value(page, 0) != "드래프트 확인용 자막", shot_value(page, 0))
    page.locator('[data-testid="draft-list"] button:has-text("열기")').first.click()
    check("드래프트: 불러오면 그때 자막·설정 복원", wait_until(lambda: shot_value(page, 0) == "드래프트 확인용 자막", 4),
          shot_value(page, 0))
    page.wait_for_timeout(900)
    restored = page.evaluate("JSON.parse(localStorage.getItem('shortcut-studio:shorts:v2')||'{}').audio")
    check("드래프트: 배경음 설정도 함께 복원", bool(restored) and restored.get("mood") == "trendy", str(restored))
    page.click('[aria-label="테스트 드래프트 지우기"]')
    page.wait_for_timeout(300)
    check("드래프트: 지우기", "테스트 드래프트" not in page.inner_text('[data-testid="draft-list"]'))
    page.click('[data-testid="drafts-toggle"]')


def make_take_wav(path, seconds=2.4, rate=16000):
    """컷에 올릴 내 목소리 파일 — 220Hz 톤 WAV(브라우저가 그대로 디코드)."""
    import struct

    frames = int(rate * seconds)
    data = bytearray()
    for i in range(frames):
        value = int(0.35 * 32767 * math.sin(2 * math.pi * 220 * (i / rate)))
        data += struct.pack("<h", max(-32767, min(32767, value)))
    header = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
    header += b"data" + struct.pack("<I", len(data))
    with open(path, "wb") as handle:
        handle.write(header + bytes(data))
    return path


def run_writing(page):
    """대본 밀도 — 8~12컷 완성형, 35~60초, 자막과 나레이션이 따로 있는지."""
    print("── 대본 밀도·구성", flush=True)
    cuts = cut_count(page)
    seconds = project_seconds(page)
    subs = [shot_value(page, i) for i in range(cuts)]
    narr = voices(page)
    all_voice = " ".join(narr)

    check("대본: 8~12컷", 8 <= cuts <= 12, f"{cuts}컷")
    check("대본: 35~60초", 35 <= seconds <= 60, f"{seconds}초")
    check("대본: 컷마다 자막 4자 이상", all(len(s.strip()) >= 4 for s in subs), str(subs[:3]))
    check("대본: 자막은 짧게(34자 이하)", all(len(s.replace("*", "")) <= 34 for s in subs), str([len(s) for s in subs]))
    check("대본: 자막 강조 표기 짝이 맞음", all(s.count("*") % 2 == 0 for s in subs))
    check("대본: 컷마다 나레이션 문장", len(narr) == cuts and all(len(n) >= 15 for n in narr), f"{[len(n) for n in narr]}")
    check("대본: 나레이션 분량 충분(컷당 평균 22자 이상)", (len(all_voice) / max(1, cuts)) >= 22,
          f"{round(len(all_voice) / max(1, cuts), 1)}자/컷 · 총 {len(all_voice)}자")
    check("대본: 자막과 나레이션이 별개 문장",
          sum(1 for i in range(cuts) if narr[i].replace("*", "") != subs[i].replace("*", "")) >= cuts - 1)
    check("대본: 같은 문장 반복 없음", len(set(narr)) == cuts, str(len(set(narr))))
    cliches = ["여러분", "알아보겠습니다", "지금부터", "놀라운", "완벽한", "역대급", "꿀팁 대방축"]
    found = [word for word in cliches if word in all_voice]
    check("대본: 상투어 없음", not found, str(found))
    check("대본: 첫 컷은 훅 역할", "훅" in page.inner_text('[data-testid="shot-card-0"]'))
    last_card = page.inner_text(f'[data-testid="shot-card-{cuts - 1}"]')
    check("대본: 마지막 컷은 CTA 역할", any(word in last_card for word in ("유도", "마무리")), last_card[:40])

    # 타임라인 — 실제 편집기처럼 컷 클립과 재생 헤드가 있음
    check("타임라인: 컷마다 클립", page.locator('[data-testid^="timeline-cut-"]').count() == cuts)
    check("타임라인: 호흡 표시", "나레이션" in page.inner_text('[data-testid="timeline-blocks"]'))

    print("── 나레이션 호흡 블록", flush=True)
    blocks = block_count(page)
    block_texts = page.evaluate(
        "() => [...document.querySelectorAll('[data-testid^=\"tts-block-\"]')]"
        ".filter(e => /^tts-block-\\d+$/.test(e.dataset.testid || ''))"
        ".map(e => e.innerText)"
    )
    check("호흡: 컷을 묶어 읽음(블록 < 컷)", 0 < blocks < cuts, f"{blocks}블록 / {cuts}컷")
    check("호흡: 블록마다 2컷 이상 묶임",
          sum(1 for text in block_texts if text.strip().startswith("1컷")) <= 1,
          str([t.split(chr(10))[0] for t in block_texts]))
    first_block = block_texts[0] if block_texts else ""
    check("호흡: 첫 블록에 1·2번 컷 나레이션이 이어짐",
          narr[0][:10] in first_block and narr[1][:10] in first_block, first_block[:80])


def run_voice_studio(page):
    """나레이션 스튜디오 — 화자 스타일·내 목소리 녹음/파일·자동 맞춤."""
    print("── 화자 스타일·나레이션 설정", flush=True)
    open_tab(page, "audio")
    for style in ("story", "anchor", "friendly", "drama"):
        check(f"화자 스타일: {style}", page.locator(f'[data-testid="delivery-{style}"]').count() == 1)
    page.click('[data-testid="delivery-anchor"]')
    check("화자 스타일: 선택 반영",
          wait_until(lambda: page.get_attribute('[data-testid="shorts-frame"]', "data-delivery") == "anchor", 2),
          page.get_attribute('[data-testid="shorts-frame"]', "data-delivery"))
    wait_until(lambda: page.evaluate("(JSON.parse(localStorage.getItem('shortcut-studio:shorts:v2')||'{}').audio||{}).delivery") == "anchor", 4)
    saved_audio = page.evaluate("JSON.parse(localStorage.getItem('shortcut-studio:shorts:v2')||'{}').audio")
    check("화자 스타일: 저장됨", saved_audio.get("delivery") == "anchor", str(saved_audio.get("delivery")))
    for control in ("tts-rate", "tts-tone", "tts-breath", "tts-volume", "tts-ducking", "tts-autofit"):
        check(f"나레이션 설정: {control}", page.locator(f'[data-testid="{control}"]').count() == 1)

    print("── 내 목소리(파일 업로드)", flush=True)
    page.click('[data-testid="voice-source-mine"]')
    check("내 목소리: 패널 열림", wait_until(lambda: page.locator('[data-testid="take-panel"]').count() == 1, 2))
    take_path = os.path.join(ROOT, "scripts/.build/take-test.wav")
    make_take_wav(take_path, 2.4)
    page.set_input_files('[data-testid="take-file-input-1"]', take_path)
    applied = wait_until(lambda: page.get_attribute('[data-testid="take-row-1"]', "data-take") == "true", 8)
    check("내 목소리: 컷에 파일이 붙음", applied,
          page.get_attribute('[data-testid="take-row-1"]', "data-take"))
    page.wait_for_timeout(400)
    duration = float(
        page.eval_on_selector(
            '[data-testid="shot-duration-1"]',
            "el => el.value",
        )
    )
    check("내 목소리: 컷 길이가 녹음 길이에 맞춰짐", 2.2 <= duration <= 3.2, f"{duration}초")
    check("내 목소리: 영상 설정에 반영",
          page.evaluate("JSON.parse(localStorage.getItem('shortcut-studio:shorts:v2')||'{}').audio.voiceSource") == "mine")
    page.evaluate("window.__shortcutAudio = { voices: 0, ducks: 0, lastVoiceAt: 0 }")
    page.click('[data-testid="take-play-1"]')
    check("내 목소리: 미리듣기가 믹서로 재생", wait_until(lambda: audio_stats(page).get("voices", 0) >= 1, 4),
          str(audio_stats(page)))
    check("내 목소리: 컷 카드에 표시", "내 목소리" in page.inner_text('[data-testid="shot-card-1"]'))

    print("── 마이크 녹음(권한 거부 처리)", flush=True)
    page.click('[data-testid="take-record-2"]')
    check("마이크: 권한이 없으면 안내", wait_until(
        lambda: any("마이크" in toast.inner_text() for toast in page.locator('[role="status"]').all()), 4
    ), "권한 안내 토스트 없음")

    page.locator('[aria-label="인스펙터"]').screenshot(path=os.path.join(SHOTS, "09-voice-take.png"))
    page.click('[data-testid="take-clear-1"]')
    check("내 목소리: 지우기", wait_until(lambda: page.get_attribute('[data-testid="take-row-1"]', "data-take") == "false", 3))
    page.click('[data-testid="voice-source-ai"]')
    check("내 목소리: AI 음성으로 복귀", wait_until(lambda: page.locator('[data-testid="tts-status"]').count() == 1, 2))


def run_offline(browser, base):
    context, page = new_page(browser, base, "offline")

    print("── 첫 화면 구성", flush=True)
    check("첫 화면: 주제 입력 1개", page.locator('[data-testid="topic-input"]').count() == 1)
    check("첫 화면: 템플릿 6종", page.locator('[data-testid^="template-"]').count() == 6)
    check("첫 화면: 톤 3종", page.locator('[data-testid^="tone-"]').count() == 3)
    check("첫 화면: 만들기 버튼 1개", page.locator('[data-testid="generate"]').count() == 1)
    cuts = cut_count(page)
    check("첫 화면: 8~12컷 완성형 대본", 8 <= cuts <= 12, f"{cuts}컷")
    check("첫 화면: 컷 카드가 컷 수와 같음", page.locator('[data-testid^="shot-card-"]').count() == cuts)
    check("첫 화면: 서버 없음 배지", "내장 대본 엔진" in page.inner_text('[data-testid="server-state"]'),
          page.inner_text('[data-testid="server-state"]'))
    check("첫 화면: 정적 프리셋 이미지 없음", page.locator('img[src*="presets"]').count() == 0)

    print("── 프로 스튜디오 레이아웃(3열) · 디자인", flush=True)
    left = column_left(page, '[data-testid="topic-input"]')
    stage = column_left(page, '[data-testid="shorts-frame"]')
    right = column_left(page, '[data-testid="inspector-tab-audio"]')
    check("레이아웃: 왼쪽 대본 · 가운데 스테이지 · 오른쪽 인스펙터", 0 < left < stage < right,
          f"left={left} stage={stage} right={right}")
    check("레이아웃: 인스펙터 탭 3개",
          page.locator('[data-testid="inspector-tab-audio"], [data-testid="inspector-tab-caption"], [data-testid="inspector-tab-export"]').count() == 3)
    check("레이아웃: 모바일 탭은 데스크톱에서 숨김", not page.locator('[data-testid="mobile-tab-stage"]').is_visible())
    check("디자인: 배경 그라데이션 없음(중성 차콜)",
          page.evaluate("getComputedStyle(document.body).backgroundImage") == "none",
          page.evaluate("getComputedStyle(document.body).backgroundImage"))
    body_bg = page.evaluate("getComputedStyle(document.body).backgroundColor")
    check("디자인: 표면 #0B0D11 계열", body_bg in ("rgb(11, 13, 17)", "rgb(11, 13, 17)"), body_bg)
    found_emoji = emoji_chars(page)
    check("디자인: 화면에 이모지 0개", not found_emoji, str(found_emoji))
    check("디자인: 요금제 배지 표시", page.locator('[data-testid="pricing-open"]').is_visible())

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

    wait_until(lambda: len(page.evaluate("(window.__shortcutArt || {loaded: []})").get("loaded", [])) >= cuts, 10)
    loaded = page.evaluate("(window.__shortcutArt || {loaded: [], failed: []})")
    check("일러스트: 컷마다 한 장씩 로드", len(loaded.get("loaded", [])) >= cuts, str(loaded))
    check("일러스트: 로드 실패 0", not loaded.get("failed"), str(loaded.get("failed")))

    page.click('[data-testid="play-toggle"]')
    page.wait_for_timeout(320)
    frame_a = page.locator('[data-testid="shorts-frame"]').screenshot()
    page.wait_for_timeout(430)
    frame_b = page.locator('[data-testid="shorts-frame"]').screenshot()
    check("모션: 재생 중 화면이 계속 움직임", frame_a != frame_b, f"{len(frame_a)} / {len(frame_b)} bytes")
    page.click('[data-testid="play-toggle"]')
    if is_playing(page):
        page.click('[data-testid="play-toggle"]')

    print("── 모션 엔진: 카메라·그림 변위·자막", flush=True)
    render_at(page, 0.2)
    early = frame_probe(page)
    pixels_early = canvas_pixels(page)
    page.locator('[data-testid="shorts-frame"]').screenshot(path=os.path.join(ROOT, "scripts/.build/motion-a.png"))
    render_at(page, 1.7)
    late = frame_probe(page)
    pixels_late = canvas_pixels(page)
    page.locator('[data-testid="shorts-frame"]').screenshot(path=os.path.join(ROOT, "scripts/.build/motion-b.png"))
    check("모션: 카메라가 컷 안에서 계속 움직임(줌 0.02 이상 변화)",
          abs(late["zoom"] - early["zoom"]) > 0.02, f"zoom {early['zoom']:.2f} → {late['zoom']:.2f}")
    check("모션: 그림 자체가 일러스트 안에서 움직임(변위 1.5px 이상)",
          max(early.get("warp", 0), late.get("warp", 0)) > 1.5,
          f"warp {early.get('warp'):.1f} / {late.get('warp'):.1f}")
    check("모션: 그림이 이동(화면 중심 이동 4px 이상)",
          abs(late["x"] - early["x"]) + abs(late["y"] - early["y"]) > 4,
          f"({early['x']:.0f},{early['y']:.0f}) → ({late['x']:.0f},{late['y']:.0f})")
    spread = pixel_diff(pixels_early, pixels_late)
    check("모션: 두 시점 픽셀이 확실히 다름(정지 사진 아님)", spread["pct"] > 10, str(spread))
    render_at(page, 1.7)
    again = canvas_pixels(page)
    check("모션: 같은 시각은 같은 프레임(결정적 렌더)", pixel_diff(pixels_late, again)["mean"] < 0.5, str(pixel_diff(pixels_late, again)))

    # 모션 강도 3단계 — 화면에 바로 반영되고 저장됩니다
    check("모션 강도 버튼 3개",
          page.locator('[data-testid="motion-calm"], [data-testid="motion-vivid"], [data-testid="motion-boom"]').count() == 3)
    check("모션 기본값: 생생", page.get_attribute('[data-testid="shorts-frame"]', "data-motion") == "vivid")
    page.click('[data-testid="motion-boom"]')
    check("모션 강도: 폭발 선택", wait_until(lambda: page.get_attribute('[data-testid="shorts-frame"]', "data-motion") == "boom", 2))
    levels = {"boom": [], "calm": []}
    for level in ("boom", "calm"):
        for at in (0.4, 0.9, 1.6, 2.3):
            render_at(page, at, level)
            levels[level].append(frame_probe(page))
    boom_zoom = sum(item["zoom"] for item in levels["boom"]) / 4
    calm_zoom = sum(item["zoom"] for item in levels["calm"]) / 4
    boom_warp = sum(item["warp"] for item in levels["boom"]) / 4
    calm_warp = sum(item["warp"] for item in levels["calm"]) / 4
    check("모션 강도: 폭발이 차분보다 크게 움직임",
          boom_warp > calm_warp * 1.25 and boom_zoom >= calm_zoom - 0.01,
          f"zoom boom={boom_zoom:.2f}/calm={calm_zoom:.2f} warp boom={boom_warp:.1f}/calm={calm_warp:.1f}")
    check("모션 강도: 저장됨", page.evaluate("localStorage.getItem('shortcut-studio:motion:v1')") == "boom")
    page.click('[data-testid="motion-vivid"]')
    check("모션 강도: 생생으로 복귀", wait_until(lambda: page.get_attribute('[data-testid="shorts-frame"]', "data-motion") == "vivid", 2))

    print("── 컷마다 다른 일러스트", flush=True)
    ids_by_cut = []
    for index in range(cuts):
        page.click(f'[data-testid="shot-jump-{index}"]')
        if is_playing(page):
            page.click('[data-testid="play-toggle"]')
        page.wait_for_timeout(260)
        ids_by_cut.append(art_id(page))
    # 같은 장소가 다시 나오는 컷만 같은 그림을 다시 씁니다(그 외에는 컷마다 다른 그림).
    check("일러스트: 컷마다 다른 그림", len(set(ids_by_cut)) >= cuts - 3, str(ids_by_cut))
    check("일러스트: 이웃한 컷은 다른 그림",
          all(ids_by_cut[i] != ids_by_cut[i + 1] for i in range(len(ids_by_cut) - 1)), str(ids_by_cut))
    check("일러스트: 캔버스에 그림이 실제로 그려짐(1·3·5컷 색 대조)", True, "")
    for index in (0, 2, 4):
        page.click(f'[data-testid="shot-jump-{index}"]')
        if is_playing(page):
            page.click('[data-testid="play-toggle"]')
        page.wait_for_timeout(500)
        ok, detail = art_matches_canvas(page, ids_by_cut[index])
        check(f"{index + 1}번 컷: {ids_by_cut[index]} 그려짐", ok, detail)
    check("일러스트: 장면 이름 표시", len(page.inner_text('[data-testid="scene-label"]')) > 4)
    # 문서용 컷 이미지 — 재생 버튼 오버레이를 잠깐 숨기고, 자막이 다 뜬 시점으로 그립니다.
    page.add_style_tag(content=".pause-overlay{display:none !important}")
    timings = page.evaluate(
        "JSON.parse(localStorage.getItem('shortcut-studio:shorts:v2')||'{}').cuts.map(c=>c.duration)"
    ) or [2.8, 3, 3, 3, 2.9, 3]
    starts_at = []
    acc = 0
    for duration in timings:
        starts_at.append(acc)
        acc += duration
    for index in range(cuts):
        page.click(f'[data-testid="shot-jump-{index}"]')
        # 컷 이동은 자동 재생을 시작하므로, 재생이 실제로 시작된 걸 확인하고 멈춥니다.
        wait_until(lambda: is_playing(page), 2)
        page.click('[data-testid="play-toggle"]')
        wait_until(lambda: not is_playing(page), 2)
        render_at(page, starts_at[index] + timings[index] * 0.72)
        page.locator('[data-testid="shorts-frame"]').screenshot(path=os.path.join(SHOTS, f"cut-{index + 1}.png"))
    compose_cuts(cuts)

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

    run_writing(page)

    print("── 재생: 컷 전환 + 한국어 음성", flush=True)
    first_voice = voices(page)[0].replace("*", "")
    second_voice = voices(page)[1].replace("*", "")
    page.click('[data-testid="play-toggle"]')
    check("재생 상태 전환", wait_until(lambda: is_playing(page), 3))
    check("컷 전환(1→2 이상)", wait_until(lambda: active_index(page) >= 1, 10), f"index={active_index(page)}")
    speaks = spoken(page)
    check("음성 읽기 호출", len(speaks) >= 2, f"{len(speaks)}회")
    check("음성 언어 ko-KR", bool(speaks) and all(item.get("lang") == "ko-KR" for item in speaks))
    check("첫 호흡이 1번 컷 나레이션으로 시작", bool(speaks) and speaks[0].get("text", "").startswith(first_voice[:12]),
          f"{speaks[0].get('text') if speaks else ''} / {first_voice}")
    check("한 호흡이 여러 컷을 이어 읽음(컷 수보다 적은 발화)", bool(speaks) and 1 < len(speaks) < cuts,
          f"{len(speaks)}발화 / {cuts}컷")
    check("호흡 안에 다음 컷 나레이션도 들어 있음",
          bool(speaks) and second_voice[:10] in speaks[0].get("text", ""),
          f"{speaks[0].get('text') if speaks else ''} / {second_voice}")
    check("다음 컷 자막이 화면에 바뀜", player_text(page).replace("*", "") != first_voice)

    print("── 음소거", flush=True)
    page.click('[data-testid="sound-toggle"]')
    check("음소거 상태 반영", page.get_attribute('[data-testid="sound-toggle"]', "aria-pressed") == "false")
    before = len(spoken(page))
    page.wait_for_timeout(3600)
    check("음소거 중에는 읽지 않음", len(spoken(page)) == before, f"{before} → {len(spoken(page))}")

    page.click('[data-testid="play-toggle"]')
    check("일시정지", wait_until(lambda: not is_playing(page), 3))

    run_voice_studio(page)

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
    before_order = [shot_value(page, i) for i in range(cuts)]
    page.click('[data-testid="shot-move-right-0"]')
    after_order = [shot_value(page, i) for i in range(cuts)]
    check("1번 컷을 뒤로 이동", after_order[0] == before_order[1] and after_order[1] == before_order[0],
          f"{after_order[0]} / {before_order[1]}")

    print("── 내보내기", flush=True)
    open_tab(page, "export")
    page.click('[data-testid="copy-script"]')
    page.wait_for_timeout(500)
    try:
        clip = page.evaluate("navigator.clipboard.readText()")
    except Exception as exc:  # noqa: BLE001
        clip = f"__clipboard_error__{exc}"
    check("대본 복사: 컷 수만큼 포함", clip.count("자막:") == cuts, clip[:80])
    check("대본 복사: 나레이션 문장 포함", clip.count("나레이션:") == cuts, clip[:120])
    check("대본 복사: 주제 포함", "주제:" in clip)
    check("대본 복사: 가이드 문장 포함", "마지막 자막에" in clip)

    with page.expect_download(timeout=8000) as info:
        page.click('[data-testid="download-srt"]')
    srt_path = info.value.path()
    srt = open(srt_path, encoding="utf-8").read() if srt_path else ""
    check("SRT 저장: 컷 수만큼 블록", srt.count("-->") == cuts, f"{srt.count('-->')}개 / {cuts}컷")
    check("SRT 저장: 타임코드 형식", "00:00:00,000 -->" in srt, srt[:40])
    check("SRT 저장: 강조 별표 제거", "*" not in srt)

    with page.expect_download(timeout=8000) as info2:
        page.click('[data-testid="download-guide"]')
    guide = open(info2.value.path(), encoding="utf-8").read()
    check("가이드 저장: 컷별 안내", guide.count("카메라:") == cuts and "화면:" in guide)
    check("가이드 저장: 연락처·메일 패턴 없음", not re.search(r"01[0-9][- ]?\d{3,4}[- ]?\d{4}", guide) and "@" not in guide)

    with page.expect_download(timeout=8000) as info3:
        page.click('[data-testid="download-script"]')
    script_txt = open(info3.value.path(), encoding="utf-8").read()
    check("대본 .txt 저장: 컷 수만큼", script_txt.count("자막:") == cuts)
    page.click('[data-testid="copy-guide"]')
    page.wait_for_timeout(400)
    try:
        guide_clip = page.evaluate("navigator.clipboard.readText()")
    except Exception:  # noqa: BLE001
        guide_clip = ""
    check("가이드 복사: 컷별 안내", guide_clip.count("카메라:") == cuts, guide_clip[:60])

    print("── 영상 저장(WebM 녹화)", flush=True)
    # 검증 시간을 줄이려고 컷을 짧게 잡습니다(2.2초 × 10컷 ≈ 22초 녹화).
    for index in range(cuts):
        set_range(page, f'[data-testid="shot-duration-{index}"]', 2.2)
    page.wait_for_timeout(400)
    check("영상 저장: 짧게 편집한 길이", 20 < project_seconds(page) < 26, f"{project_seconds(page)}초")
    page.click('[data-testid="shot-jump-0"]')
    page.wait_for_timeout(350)
    video_art = art_id(page)
    if is_playing(page):
        page.click('[data-testid="play-toggle"]')
    check("영상 저장 버튼", page.locator('[data-testid="export-video"]').count() == 1)
    export_format = page.get_attribute('[data-testid="export-format"]', "data-format")
    check("영상 형식 배지: MP4 또는 WebM", export_format in ("mp4", "webm"), str(export_format))
    # 배경음이 실제로 녹음되는지 보려면 음소거를 풀고 무드를 켜 둡니다(앞선 음소거 테스트에서 꺼졌음).
    ensure_sound_on(page)
    open_tab(page, "audio")
    page.click('[data-testid="bgm-trendy"]')
    page.wait_for_timeout(300)
    open_tab(page, "export")
    if page.locator('[data-testid="export-video"]').is_enabled():
        try:
            with page.expect_download(timeout=90000) as video_info:
                page.click('[data-testid="export-video"]')
            video_path = video_info.value.path()
            video_size = os.path.getsize(video_path) if video_path else 0
            check("영상 저장: 파일 생성", video_size > 50000, f"{video_size} bytes")
            expected_ext = ".mp4" if export_format == "mp4" else ".webm"
            check(f"영상 저장: {expected_ext} 확장자(배지와 일치)",
                  (video_info.value.suggested_filename or "").endswith(expected_ext),
                  f"{video_info.value.suggested_filename} / badge={export_format}")
            record = export_record(page) or {}
            check("영상 저장: 720p HD (Free)", record.get("width") == 720 and record.get("height") == 1280, str(record))

            audio_state = page.evaluate(
                """async () => {
                  try {
                    const Ctor = window.AudioContext || window.webkitAudioContext;
                    const ctx = new Ctor();
                    await ctx.resume();
                    const state = ctx.state;
                    await ctx.close();
                    return state;
                  } catch (e) { return 'error'; }
                }"""
            )
            probe = subprocess.run([FFMPEG, "-threads", "1", "-i", video_path], capture_output=True, text=True)
            has_audio = "Audio:" in probe.stderr
            check("영상 저장: 오디오 트랙 포함", has_audio, (probe.stderr or "")[-160:])
            # 녹음된 소리가 실제로 들리는지 — 브라우저에서 파일을 다시 풀어 파형을 재 봅니다.
            sound = page.evaluate(
                """async () => {
                  const rec = window.__shortcutLastExport;
                  if (!rec) return { ok: false, reason: 'no export record' };
                  if (!rec.withAudio) return { ok: false, reason: 'exported without audio' };
                  try {
                    const buffer = await rec.blob.arrayBuffer();
                    const ctx = new AudioContext();
                    const decoded = await ctx.decodeAudioData(buffer);
                    const data = decoded.getChannelData(0);
                    let peak = 0, sum = 0, count = 0;
                    for (let i = 0; i < data.length; i += 7) {
                      const v = Math.abs(data[i]);
                      if (v > peak) peak = v;
                      sum += v * v;
                      count += 1;
                    }
                    await ctx.close();
                    return { ok: true, peak, rms: Math.sqrt(sum / Math.max(1, count)), seconds: decoded.duration };
                  } catch (err) { return { ok: false, reason: String(err) }; }
                }"""
            )
            check("영상 저장: 배경음이 실제 소리로 녹음됨",
                  bool(sound.get("ok")) and sound.get("rms", 0) > 0.003,
                  f"{sound} · AudioContext={audio_state}")
            frame_path = os.path.join(ROOT, "scripts/.build/video-frame.png")
            later_path = os.path.join(ROOT, "scripts/.build/video-frame-later.png")
            grabbed, reason = video_frame(page, 1.2, frame_path)
            if grabbed:
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

                # 움직임이 영상에도 그대로 구워졌는지 — 0.4초와 1.6초 프레임 비교
                grabbed_later, _ = video_frame(page, 1.9, later_path)
                if grabbed_later:
                    first = Image.open(frame_path).convert("RGB").resize((54, 96))
                    later = Image.open(later_path).convert("RGB").resize((54, 96))
                    delta = ImageChops.difference(first, later)
                    moved = sum(ImageStat.Stat(delta).mean) / 3
                    check("영상 저장: 시간에 따라 화면이 움직임(모션 구워짐)", moved > 2.5, f"mean diff={moved:.1f}")
                else:
                    check("영상 저장: 두 번째 프레임 추출", False, str(grabbed_later))
            else:
                check("영상 저장: 프레임 추출", False, str(reason))
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
    check("새 대본 8~12컷 유지", 8 <= cut_count(page) <= 12, f"{cut_count(page)}컷")
    new_first = shot_value(page, 0)
    check("주제에 맞는 훅 (자취)", ("자취" in new_first or "혼자" in new_first), new_first)
    check("템플릿 선택 유지", page.get_attribute('[data-testid="template-living"]', "aria-pressed") == "true")
    check("톤 선택 유지", page.get_attribute('[data-testid="tone-empathy"]', "aria-pressed") == "true")
    check("만들기 후 재생 위치 1번 컷", active_index(page) <= 1, f"index={active_index(page)}")

    page.wait_for_timeout(900)
    saved = page.evaluate("JSON.parse(localStorage.getItem('shortcut-studio:shorts:v2') || '{}')")
    check("자동 저장: localStorage", saved.get("topic") == "자취 3년차가 아는 꿀팁", str(saved.get("topic")))
    check("자동 저장: 컷 수만큼", len(saved.get("cuts", [])) == cut_count(page))
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="shot-subtitle-0"]')
    check("새로고침 후 복원", shot_value(page, 0) == new_first, shot_value(page, 0))

    page.evaluate("window.scrollTo(0, 0)")
    page.click('[data-testid="restart"]')
    page.wait_for_timeout(4200)  # 안내 토스트가 사라진 뒤에 찍습니다
    hero_shot(page, os.path.join(SHOTS, "01-studio.png"))

    print("── 템플릿×톤 로컬 엔진 문장 확인", flush=True)
    combos = [
        ("balance", "cider", "월급 1.5배 vs 칼퇴"),
        ("living", "empathy", "자취 시작할 때 사는 것"),
        ("love", "humor", "소개팅 첫 카톡"),
        ("review", "cider", "요즘 줄 서는 브런치 카페"),
        ("issue", "cider", "이번 주 IT 이슈 정리"),
        ("it", "cider", "앱 출시 전 체크리스트"),
    ]
    firsts = []
    for tpl, tn, sample in combos:
        page.click(f'[data-testid="template-{tpl}"]')
        page.fill('[data-testid="topic-input"]', sample)
        page.click(f'[data-testid="tone-{tn}"]')
        page.click('[data-testid="generate"]')
        page.wait_for_timeout(500)
        count_now = cut_count(page)
        subs = [shot_value(page, i) for i in range(count_now)]
        narr = voices(page)
        well_formed = all(len(s.strip()) >= 4 for s in subs) and all(s.count("*") % 2 == 0 for s in subs)
        check(f"로컬 엔진 {tpl}/{tn}: 8~12컷 문장", 8 <= count_now <= 12 and well_formed, str(subs)[:140])
        check(f"로컬 엔진 {tpl}/{tn}: 나레이션 문장이 컷마다 있음",
              len(narr) == count_now and all(len(n) >= 15 for n in narr),
              f"{len(narr)}개 / {[len(n) for n in narr][:4]}")
        check(f"로컬 엔진 {tpl}/{tn}: 자막과 나레이션이 다름",
              sum(1 for i in range(count_now) if narr[i].replace('*', '') != subs[i].replace('*', '')) >= count_now - 1)
        firsts.append(subs[0])
    check("템플릿마다 다른 대본", len(set(firsts)) == 6, str(firsts)[:160])

    run_studio_extras(page)

    print("── 이상한 입력 방어", flush=True)
    for odd in ["ㅁㄴㅇㄹ", "월급 vs 야근 vs 칼퇴", "가" * 80]:
        page.fill('[data-testid="topic-input"]', odd)
        page.click('[data-testid="generate"]')
        page.wait_for_timeout(450)
        count = page.locator('[data-testid^="shot-card-"]').count()
        subs = [shot_value(page, i) for i in range(count)]
        check(f"이상 입력 8~12컷 유지 ({odd[:8]})", 8 <= count <= 12 and all(len(s.strip()) >= 4 for s in subs), f"{count}컷")

    offline_errors = [e for e in errors if e.startswith("[offline:")]
    check("데스크톱: 콘솔 에러 0", not offline_errors, str(offline_errors[:2]))
    context.close()


def run_mobile(browser, base):
    """모바일 390px — 별도 브라우저로 띄웁니다(single-process에서 두 번째 컨텍스트가 죽는 환경 대응)."""
    print("── 모바일 390px", flush=True)
    mob_ctx, mob = new_page(browser, base, "offline-mobile", viewport={"width": 390, "height": 844})
    check("모바일: 가로 넘침 0", no_overflow(mob),
          mob.evaluate("document.documentElement.scrollWidth - window.innerWidth"))
    frame_box = mob.locator('[data-testid="shorts-frame"]').bounding_box()
    check("모바일: 플레이어 9:16", frame_box and abs(frame_box["width"] / frame_box["height"] - 9 / 16) < 0.02,
          str(frame_box))
    check("모바일: 스테이지 탭 기본", mob.locator('[data-testid="shorts-frame"]').is_visible())
    check("모바일: 작업 탭 3개",
          mob.locator('[data-testid="mobile-tab-script"], [data-testid="mobile-tab-stage"], [data-testid="mobile-tab-inspector"]').count() == 3)
    mob.click('[data-testid="mobile-tab-script"]')
    mob.wait_for_timeout(250)
    check("모바일: 대본 탭에서 만들기 보임", mob.locator('[data-testid="generate"]').is_visible())
    check("모바일: 탭을 바꾸면 스테이지가 숨겨짐", not mob.locator('[data-testid="shorts-frame"]').is_visible())
    mob.click('[data-testid="mobile-tab-stage"]')
    mob.wait_for_timeout(250)
    mob.click('[data-testid="mobile-tab-inspector"]')
    mob.wait_for_timeout(250)
    check("모바일: 설정 탭에서 배경음 패널 보임", mob.locator('[data-testid="bgm-trendy"]').is_visible())
    mob.click('[data-testid="mobile-tab-stage"]')
    mob.wait_for_timeout(250)
    mob.evaluate("window.scrollTo(0, 0)")
    mob.wait_for_timeout(200)
    clean_shot(mob, os.path.join(SHOTS, "02-mobile.png"))
    mobile_errors = [e for e in errors if e.startswith("[offline-mobile")]
    check("모바일: 콘솔 에러 0", not mobile_errors, str(mobile_errors[:2]))
    mob_ctx.close()


def run_ai(browser, base, port):
    capture = os.path.join(ROOT, "scripts/.build/gemini-request.json")
    try:
        os.remove(capture)
    except FileNotFoundError:
        pass
    reset_tts_log()
    context, page = new_page(browser, base, "ai")
    check("AI: 상태 배지 표시", wait_until(lambda: "AI 대본 연결됨" in page.inner_text('[data-testid="server-state"]'), 8),
          page.inner_text('[data-testid="server-state"]'))

    reset_tts_log()
    page.fill('[data-testid="topic-input"]', "AI 테스트 주제")
    page.click('[data-testid="template-it"]')
    page.click('[data-testid="tone-humor"]')
    page.click('[data-testid="generate"]')
    check("AI: 대본 적용", wait_until(lambda: "AI가 쓴" in shot_value(page, 0), 12), shot_value(page, 0))
    ai_cuts = cut_count(page)
    check("AI: 8~12컷", 8 <= ai_cuts <= 12, f"{ai_cuts}컷")
    check("AI: 컷마다 나레이션 문장", all(len(n) >= 15 for n in voices(page)), str([len(n) for n in voices(page)]))
    check("AI: 자동 재생", wait_until(lambda: is_playing(page), 4))
    check("AI: 첫 컷이 화면에도 반영", "AI가 쓴" in player_text(page), player_text(page))

    # 이 대본의 음성 요청만 따로 봅니다(생성 직전에 로그를 비웠음).
    open_tab(page, "audio")
    ai_blocks = block_count(page)
    check("TTS: AI 대본도 호흡 블록으로 묶임", 0 < ai_blocks < ai_cuts, f"{ai_blocks}블록 / {ai_cuts}컷")
    check("TTS: AI 대본 호흡 음성 모두 준비",
          wait_until(lambda: page.get_attribute('[data-testid="tts-status"]', "data-ready") == str(ai_blocks), 30),
          page.get_attribute('[data-testid="tts-status"]', "data-ready"))
    ai_calls = [call for call in tts_calls() if call.get("provider") == "auto" and call.get("text")]
    ai_texts = [call.get("text", "") for call in ai_calls]
    check("TTS: 호흡 단위로 요청(요청 수 < 컷 수)", 0 < len(ai_texts) < ai_cuts, f"{len(ai_texts)}회 / {ai_cuts}컷")
    check("TTS: 한 요청에 여러 컷이 이어짐(평균 60자 이상)",
          bool(ai_texts) and (sum(len(t) for t in ai_texts) / len(ai_texts)) >= 60, str([len(t) for t in ai_texts]))
    check("TTS: 요청 문장에 마침표가 있는 호흡", bool(ai_texts) and any("." in t for t in ai_texts), str(ai_texts[:1])[:100])
    check("TTS: 화자 스타일·보이스를 함께 보냄",
          bool(ai_calls) and all(call.get("style") for call in ai_calls) and all(call.get("voice") for call in ai_calls),
          str(ai_calls[-1] if ai_calls else {})[:140])
    check("TTS: 별표 없이 요청", bool(ai_texts) and all("*" not in t for t in ai_texts))

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
    check("AI: 프롬프트에 훅 공식", "0~3초" in captured.get("system", ""))
    check("AI: 프롬프트에 8~12컷 지시", "8~12" in captured.get("system", "") and "voice" in captured.get("system", ""))
    check("AI: 프롬프트에 나레이션 규칙", "나레이션" in captured.get("system", "") and "이웃한 컷" in captured.get("system", ""))
    check("AI: 프롬프트에 상투어 금지", "알아보겠습니다" in captured.get("system", ""))

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
    hero_shot(page, os.path.join(SHOTS, "03-ai.png"))

    print("── AI 실패 → 내장 엔진 폴백", flush=True)
    page.fill('[data-testid="topic-input"]', "실패 케이스")
    page.click('[data-testid="generate"]')
    check("폴백: 새 대본 생성", wait_until(lambda: "AI가 쓴" not in shot_value(page, 0), 12), shot_value(page, 0))
    check("폴백: 안내 토스트", wait_until(lambda: page.locator('[role="status"]').count() > 0, 4))

    status, payload = api(port)
    check("API GET: ai 준비됨", status == 200 and payload.get("ai") is True and payload.get("provider") == "gemini", str(payload)[:120])
    status, payload = api(port, "POST", {"topic": "테스트 주제", "template": "living", "tone": "cider"})
    check("API POST: 8~12컷 반환", status == 200 and 8 <= len(payload.get("cuts", [])) <= 12, str(payload)[:120])
    check("API POST: 컷마다 voice", bool(payload.get("cuts")) and all(cut.get("voice") for cut in payload.get("cuts", [])),
          str(payload.get("cuts", [{}])[0])[:120])
    status, payload = api(port, "POST", {"topic": "a"})
    check("API POST: 짧은 주제 400", status == 400, str(payload)[:100])


    print("── AI 음성(TTS) 서버", flush=True)
    status, payload = tts_api(port, "")
    check("TTS GET: 서버 상태", status == 200 and payload.get("provider") in ("google", "google-translate"), str(payload)[:120])
    check("TTS GET: 엔진 목록(구글 기본)", payload.get("engines", {}).get("google") is True
          and payload.get("engines", {}).get("openai") is False, str(payload.get("engines")))
    status, payload = tts_api(port, "월급 1.5배", provider="openai")
    check("TTS GET: 키 없는 엔진은 501", status == 501 and payload.get("error", {}).get("code") == "no_provider",
          f"{status} {str(payload)[:80]}")
    status, payload = tts_api(port, "월급 1.5배 vs 칼퇴, 당신의 선택은?")
    check("TTS GET: 한국어 음성 응답", status == 200 and (payload.get("bytes") or 0) > 2000,
          f"status={status} bytes={payload.get('bytes')} type={payload.get('type')}")
    status, payload = tts_api(port, "월급 1.5배 vs 칼퇴, 당신의 선택은?")
    check("TTS GET: 같은 문장은 캐시로 즉시 응답", status == 200 and payload.get("cached") is True, str(payload)[:120])
    status, payload = tts_api(port, "가" * 1200)
    check("TTS GET: 너무 긴 문장 413", status == 413, str(payload)[:120])
    status, payload = tts_api(port, "   ")
    check("TTS GET: 빈 문장 400", status == 400, str(payload)[:120])

    open_tab(page, "audio")
    check("TTS: 서버 음성 배지", wait_until(lambda: "서버 음성" in page.inner_text('[data-testid="tts-status"]'), 10),
          page.inner_text('[data-testid="tts-status"]')[:80])
    tts_blocks = block_count(page)
    check("TTS: 화면에도 같은 블록 수", tts_blocks == ai_blocks, f"{tts_blocks} / {ai_blocks}")

    page.locator('[aria-label="인스펙터"]').screenshot(path=os.path.join(SHOTS, "07-audio-tts.png"))

    print("── 나레이션 미리보기 믹싱", flush=True)
    pause_video(page)
    page.evaluate("window.__shortcutAudio = { voices: 0, ducks: 0, lastVoiceAt: 0 }")
    page.click('[data-testid="play-toggle"]')
    check("나레이션: 재생 시작", wait_until(lambda: is_playing(page), 4))
    check("나레이션: 호흡마다 음성이 믹서에 얹힘", wait_until(lambda: audio_stats(page).get("voices", 0) >= 2, 14),
          str(audio_stats(page)))
    check("나레이션: 영상 전체 길이가 음성 길이에 자동 맞춤",
          abs(project_seconds(page) - narration_seconds(page)) <= 2.5,
          f"영상 {project_seconds(page)}초 / 음성 {narration_seconds(page)}초")
    stats = audio_stats(page)
    check("나레이션: 음성 구간에 배경음 덕킹", stats.get("ducks", 0) >= 2, str(stats))
    page.click('[data-testid="play-toggle"]')
    wait_until(lambda: not is_playing(page), 3)
    page.click('[data-testid="voice-fast"]')
    page.wait_for_timeout(400)
    check("TTS: 보이스 프리셋 변경 반영",
          wait_until(lambda: page.get_attribute('[data-testid="shorts-frame"]', "data-voice") == "fast", 3),
          page.get_attribute('[data-testid="shorts-frame"]', "data-voice"))

    print("── 요금제(Free → Pro)", flush=True)
    check("요금제: 헤더에 현재 플랜(Free)", "Free" in page.inner_text('[data-testid="pricing-open"]'))
    open_tab(page, "export")
    pause_video(page)
    render_at(page, 1.0)
    free_strip = canvas_strip(page)
    check("요금제: Free는 1080p가 잠김",
          page.get_attribute('[data-testid="export-res-1080"]', "data-active") != "true")
    page.click('[data-testid="pricing-open"]')
    check("요금제: 요금제 모달 열림", wait_until(lambda: page.locator('[data-testid="pricing"]').count() == 1, 3))
    check("요금제: 3개 플랜", page.locator('[data-testid^="plan-option-"]').count() == 3)
    pricing_text = page.inner_text('[data-testid="pricing"]')
    check("요금제: Pro 월 19,000원", "19,000원" in pricing_text, pricing_text[:80])
    check("요금제: Team 월 49,000원", "49,000원" in pricing_text, pricing_text[:80])
    check("요금제: 기능 비교표", "플랫폼 워터마크" in pricing_text and "1080p FHD" in pricing_text)
    page.click('[data-testid="cycle-annual"]')
    page.wait_for_timeout(250)
    check("요금제: 연간 결제 가격(190,000원)", "190,000원" in page.inner_text('[data-testid="pricing"]'),
          page.inner_text('[data-testid="pricing"]')[:80])
    page.screenshot(path=os.path.join(SHOTS, "06-pricing.png"))
    page.click('[data-testid="cycle-monthly"]')
    page.wait_for_timeout(150)
    page.click('[data-testid="pricing-activate-pro"]')
    check("요금제: Pro 체험 활성화", wait_until(lambda: page.locator('[data-testid="pricing"]').count() == 0, 3))
    check("요금제: 헤더 플랜이 Pro로 바뀜", "Pro" in page.inner_text('[data-testid="pricing-open"]'))
    saved_plan = page.evaluate("JSON.parse(localStorage.getItem('shortcut-studio:plan:v1')||'{}')")
    check("요금제: 플랜 저장(localStorage)", saved_plan.get("id") == "pro" and saved_plan.get("demo") is True, str(saved_plan))
    open_tab(page, "audio")
    check("요금제: Pro는 보이스 4종 잠금 해제",
          page.get_attribute('[data-testid="voice-calm"]', "data-locked") == "false" and
          page.get_attribute('[data-testid="voice-low"]', "data-locked") == "false")
    open_tab(page, "export")
    page.click('[data-testid="export-res-1080"]')
    page.wait_for_timeout(200)
    check("요금제: Pro 1080p 선택 가능", page.get_attribute('[data-testid="export-res-1080"]', "data-active") == "true")
    pause_video(page)
    render_at(page, 1.0)
    pro_strip = canvas_strip(page)
    mark_band = strip_bright(free_strip)
    check("요금제: Free는 하단에 플랫폼 표식", mark_band > 0.0015, f"band bright={mark_band:.4f}")
    gone = pixel_diff(free_strip, pro_strip)
    check("요금제: Pro는 플랫폼 표식 제거", gone["pct"] > 1.5, str(gone))

    print("── 1080p 나레이션 영상 저장", flush=True)
    # 문서용 컷 — 대표 프리셋으로 대본을 새로 깔고(음성도 그 문장으로 다시 준비) 저장합니다.
    open_tab(page, "audio")
    page.click('[data-testid="preset-balance-game"]')
    wait_until(lambda: block_count(page) > 0, 4)
    preset_blocks = block_count(page)
    wait_until(lambda: page.get_attribute('[data-testid="tts-status"]', "data-ready") == str(preset_blocks), 30)
    open_tab(page, "export")
    page.click('[data-testid="export-res-1080"]')
    page.wait_for_timeout(200)
    check("나레이션 영상: 1080p 선택 유지", page.get_attribute('[data-testid="export-res-1080"]', "data-active") == "true")
    ensure_sound_on(page)
    page.click('[data-testid="shot-jump-0"]')
    page.wait_for_timeout(400)
    if is_playing(page):
        page.click('[data-testid="play-toggle"]')
    # 검증 시간·메모리를 줄이려고 컷을 짧게 잡습니다(1.8초 × 10컷 ≈ 18초 녹화).
    for index in range(cut_count(page)):
        set_range(page, f'[data-testid="shot-duration-{index}"]', 1.8)
    page.wait_for_timeout(400)
    page.evaluate("window.__shortcutAudio = { voices: 0, ducks: 0, lastVoiceAt: 0 }")
    video_path = None
    if page.locator('[data-testid="export-video"]').is_enabled():
        try:
            with page.expect_download(timeout=120000) as video_info:
                page.click('[data-testid="export-video"]')
            video_path = video_info.value.path()
            record = export_record(page) or {}
            check("나레이션 영상: 1080×1920 FHD", record.get("width") == 1080 and record.get("height") == 1920, str(record))
            check("나레이션 영상: 호흡마다 음성이 영상에 들어감", record.get("narratedCuts") == preset_blocks,
                  f"{record.get('narratedCuts')} / {preset_blocks}")
            check("나레이션 영상: 오디오가 실제 소리", (record.get("rms") or 0) > 0.02, f"rms={record.get('rms')}")
            export_stats = audio_stats(page)
            check("나레이션 영상: 호흡마다 덕킹 자동화", export_stats.get("ducks", 0) >= preset_blocks, str(export_stats))
            frame_path = os.path.join(ROOT, "scripts/.build/video-1080.png")
            grabbed, reason = video_frame(page, 1.2, frame_path)
            if grabbed:
                frame = Image.open(frame_path).convert("RGB")
                check("나레이션 영상: 1080p 프레임", frame.size == (1080, 1920), str(frame.size))
                mark = region_bright(frame_path, 0.952, 0.982)
                check("나레이션 영상: Pro는 플랫폼 표식 없음", mark < 0.002, f"mark bright={mark:.4f}")
                frame.save(os.path.join(SHOTS, "08-export-1080.png"))
            else:
                check("나레이션 영상: 프레임 추출", False, str(reason))
            check("나레이션 영상: 파일 크기", os.path.getsize(video_path) > 200000 if video_path else False)
        except Exception as exc:  # noqa: BLE001
            check("나레이션 영상: 저장 완료", False, f"{type(exc).__name__}: {str(exc)[:120]}")
    else:
        check("나레이션 영상: 저장 가능", False, "button disabled")

    page.click('[data-testid="pricing-open"]')
    page.wait_for_timeout(250)
    page.click('[data-testid="pricing-choose-free"]')
    page.wait_for_timeout(300)
    savings = page.evaluate("JSON.parse(localStorage.getItem('shortcut-studio:plan:v1')||'{}')")
    check("요금제: 무료로 되돌리기", savings.get("id") == "free", str(savings))

    ai_errors = [e for e in errors if e.startswith("[ai:")]
    check("AI: 콘솔 에러 0", not ai_errors, str(ai_errors[:2]))
    context.close()


def run_nokey(browser, base, port):
    context, page = new_page(browser, base, "nokey")
    check("키 없음: 배지", wait_until(lambda: "내장 대본 엔진" in page.inner_text('[data-testid="server-state"]'), 8))
    page.click('[data-testid="template-living"]')
    page.fill('[data-testid="topic-input"]', "월세 아끼는 방법")
    page.click('[data-testid="generate"]')
    check("키 없음: 내장 엔진 생성", wait_until(lambda: 8 <= cut_count(page) <= 12 and is_playing(page), 8))
    page.wait_for_timeout(900)
    saved = page.evaluate("JSON.parse(localStorage.getItem('shortcut-studio:shorts:v2') || '{}')")
    check("키 없음: 입력한 주제 유지", saved.get("topic") == "월세 아끼는 방법", str(saved.get("topic")))
    check("키 없음: source=local", saved.get("source") == "local", str(saved.get("source")))

    status, payload = api(port)
    check("API GET: no_key", status == 200 and payload.get("ai") is False and payload.get("reason") == "no_key", str(payload)[:100])
    status, payload = tts_api(port, "AI 키가 없어도 나레이션은 나옵니다.")
    check("키 없음: 음성(TTS)은 그대로 동작", status == 200 and (payload.get("bytes") or 0) > 2000, str(payload)[:100])
    open_tab(page, "audio")
    check("키 없음: 화면에도 서버 음성 표시", wait_until(lambda: "서버 음성" in page.inner_text('[data-testid="tts-status"]'), 10),
          page.inner_text('[data-testid="tts-status"]')[:60])
    status, payload = api(port, "POST", {"topic": "테스트 주제"})
    check("API POST: 501 no_key", status == 501 and payload.get("error", {}).get("code") == "no_key", str(payload)[:100])

    nokey_errors = [e for e in errors if e.startswith("[nokey:")]
    check("키 없음: 콘솔 에러 0", not nokey_errors, str(nokey_errors[:2]))
    context.close()


def run_ttsx(browser, base, port):
    """음성 엔진 어댑터 — 서버에 OpenAI 키만 있을 때 자동으로 그 음성을 씁니다."""
    print("── 음성 엔진 어댑터", flush=True)
    status, payload = tts_api(port, "")
    check("음성 어댑터: 상태에 엔진 목록", status == 200 and isinstance(payload.get("engines"), dict), str(payload)[:120])
    check("음성 어댑터: OpenAI 키 인식", payload.get("provider") == "openai"
          and payload.get("engines", {}).get("openai") is True, str(payload.get("engines")))
    check("음성 어댑터: ElevenLabs 미설정", payload.get("engines", {}).get("elevenlabs") is False)
    status, payload = tts_api(port, "어댑터 확인 문장입니다.", provider="openai")
    check("음성 어댑터: 지정한 엔진으로 응답", status == 200 and payload.get("provider") == "openai"
          and (payload.get("bytes") or 0) > 2000, f"{status} {str(payload)[:80]}")
    status, payload = tts_api(port, "구글 음성도 살아 있습니다.", provider="google")
    check("음성 어댑터: 구글 폴백", status == 200 and payload.get("provider") in ("google", "google-translate"), str(payload)[:80])
    status, payload = tts_api(port, "일레븐랩스 확인", provider="elevenlabs")
    check("음성 어댑터: 키 없는 엔진은 501", status == 501 and payload.get("error", {}).get("code") == "no_provider",
          f"{status} {str(payload)[:80]}")

    context, page = new_page(browser, base, "ttsx")
    page.wait_for_timeout(600)
    open_tab(page, "audio")
    check("음성 어댑터: 화면에 OpenAI 음성 표시",
          wait_until(lambda: "OpenAI 음성" in page.inner_text('[data-testid="tts-status"]'), 20),
          page.inner_text('[data-testid="tts-status"]')[:80])
    check("음성 어댑터: 엔진 값이 화면에 남음",
          page.get_attribute('[data-testid="tts-status"]', "data-engine") == "openai",
          page.get_attribute('[data-testid="tts-status"]', "data-engine"))
    ttsx_errors = [e for e in errors if e.startswith("[ttsx:")]
    check("음성 어댑터: 콘솔 에러 0", not ttsx_errors, str(ttsx_errors[:2]))
    context.close()


BROWSER = [None]
PLAYWRIGHT = [None]


def ensure_browser(browser=None):
    """컨테이너에서 크로미움이 죽었으면 새로 띄웁니다(single-process 모드라 한 번 죽으면 다시 살아나지 않음)."""
    if browser is not None and browser.is_connected():
        return browser
    try:
        if browser is not None:
            browser.close()
    except Exception:  # noqa: BLE001
        pass
    fresh = launch_browser(PLAYWRIGHT[0])
    BROWSER[0] = fresh
    return fresh


def launch_browser(playwright, attempts=8):
    """컨테이너에 다른 작업이 많으면 스레드가 모자라 크로미움이 뜨지 못합니다.
    스레드를 적게 쓰는 single-process부터 시도하고, 잠깐 기다렸다 다시 띄웁니다."""
    last = None
    for attempt in range(attempts):
        for args in (
            ["--no-sandbox", "--single-process", "--no-zygote", "--disable-gpu"],
            ["--no-sandbox", "--disable-gpu"],
        ):
            browser = None
            try:
                browser = playwright.chromium.launch(args=args)
                # single-process 모드에서는 빈 프로브 페이지를 닫는 순간 브라우저가 종료되므로
                # 페이지를 만들지 않고 연결만 확인합니다.
                time.sleep(1.2)
                if browser.is_connected():
                    return browser
                last = RuntimeError("browser disconnected right after launch")
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
        ("offline", "정적 호스팅(서버 없음)", lambda base: run_offline(ensure_browser(BROWSER[0]), base)),
        ("mobile", "모바일 390px", lambda base: run_mobile(ensure_browser(None), base)),
        ("ai", "AI 서버", lambda base: run_ai(ensure_browser(BROWSER[0]), base, 4188)),
        ("nokey", "키 없는 서버", lambda base: run_nokey(ensure_browser(BROWSER[0]), base, 4189)),
        ("ttsx", "음성 어댑터", lambda base: run_ttsx(ensure_browser(BROWSER[0]), base, 4190)),
    ]
    ports = {"offline": 4187, "mobile": 4187, "ai": 4188, "nokey": 4189, "ttsx": 4190}
    browser_holder = [None]

    def run_plan(name, run, base):
        """컨테이너 사정으로 크로미움이 한 번 죽으면, 아직 아무것도 못 했을 때만 새로 띄워 다시 합니다."""
        before = len(checks)
        try:
            run(base)
        except Exception as exc:  # noqa: BLE001
            if len(checks) != before:
                step(name, lambda: (_ for _ in ()).throw(exc))
                return
            try:
                browser_holder[0].close()
            except Exception:  # noqa: BLE001
                pass
            time.sleep(4)
            browser_holder[0] = launch_browser(playwright_holder[0])
            step(name + " (재시도)", lambda: run(base))

    playwright_holder = [None]
    with sync_playwright() as p:
        playwright_holder[0] = p
        PLAYWRIGHT[0] = p
        browser_holder[0] = launch_browser(p)
        BROWSER[0] = browser_holder[0]
        for mode, name, run in plans:
            if only not in ("all", mode):
                continue
            with serve(mode, ports[mode]) as base:
                run_plan(name, run, base)
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
