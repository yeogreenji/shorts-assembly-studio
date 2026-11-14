#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
숏컷 스튜디오 — 프로젝트 JSON을 세로형 쇼츠 MP4(1080×1920)로 조립합니다.

사용 예
    python3 scripts/render_shorts.py my_project.json -o out.mp4
    python3 scripts/render_shorts.py my_project.json --voice edge --tts ko-KR-SunHiNeural
    python3 scripts/render_shorts.py my_project.json --voice none --no-bgm
    python3 scripts/render_shorts.py my_project.json --banner "직장인 밸런스 게임" --no-progress

필요한 것
    - FFmpeg (libx264, libass 포함 빌드):  맥 `brew install ffmpeg`, 윈도우 `winget install ffmpeg`
    - 한글 폰트: 맥/윈도우 기본 폰트를 자동으로 찾습니다. 없으면 --font로 지정하세요.
    - AI 목소리(선택): `pip install edge-tts` (한국어 신경망 음성, 인터넷 필요)

음성에 대해
    1) 컷에 녹음/오디오 파일이 있으면 그 소리가 그대로 들어갑니다.
    2) 없을 때 --voice auto(기본)는 edge-tts → espeak-ng → 무음 순서로 시도합니다.
       edge-tts가 있으면 ko-KR-SunHiNeural 같은 진짜 한국어 나레이션이 들어갑니다.
    3) 나레이션이 컷 길이보다 길면, 컷 길이를 목소리에 맞춰 늘려 잘리지 않게 합니다.

화면 연출
    - 상단 주제 배너(전 구간 고정) · 하단 진행바 · 쇼츠식 굵은 자막 + 강조어 팝
    - 컷마다 켄번즈 줌/팬, 컷 경계에 짧은 전환 효과음
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import wave
import zlib
from pathlib import Path

# ---------------------------------------------------------------------------
# 테마 (src/lib/presets.ts 와 같은 값)
# ---------------------------------------------------------------------------
THEMES = {
    "sunset": ("#ff6b6b", "#7c3aed", "#fde047"),
    "night": ("#0f172a", "#334155", "#38bdf8"),
    "mint": ("#06b6d4", "#065f46", "#bbf7d0"),
    "candy": ("#f472b6", "#8b5cf6", "#fef08a"),
    "mono": ("#111827", "#4b5563", "#f59e0b"),
}

BGM_MOODS = {
    "calm": dict(bpm=68, chords=[[0, 3, 7], [-2, 3, 5], [-4, 0, 3], [-5, -1, 2]],
                 pad=0.20, arp=True, kick=False, bright=0.35),
    "upbeat": dict(bpm=124, chords=[[0, 4, 7], [5, 9, 12], [7, 11, 14], [3, 7, 10]],
                   pad=0.12, arp=True, kick=True, bright=0.85,
                   groove=dict(kick=[0, 1, 2, 3], clap=[1, 3], hat=2, bass=0.13)),
    "playful": dict(bpm=116, chords=[[0, 4, 7], [2, 5, 9], [4, 7, 11], [0, 5, 7]],
                    pad=0.12, arp=True, kick=True, bright=0.78,
                    groove=dict(kick=[0, 2], clap=[1, 3], hat=2, bass=0.11)),
    "tense": dict(bpm=76, chords=[[0, 1, 7], [0, 1, 6], [-1, 0, 6], [0, 1, 7]],
                  pad=0.22, arp=False, kick=False, bright=0.15),
}

FONT_CANDIDATES = [
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
    "/Library/Fonts/AppleGothic.ttf",
    "/System/Library/Fonts/Supplemental/NanumGothic.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Bold.otf",
    "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    "/usr/share/fonts/truetype/unfonts-core/UnDotum.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
    "C:/Windows/Fonts/malgunbd.ttf",
    "C:/Windows/Fonts/malgun.ttf",
    "C:/Windows/Fonts/NanumGothic.ttf",
]

FAMILY_HINTS = [
    ("applesdgothicneo", "Apple SD Gothic Neo"),
    ("applegothic", "AppleGothic"),
    ("malgunbd", "Malgun Gothic"),
    ("malgun", "Malgun Gothic"),
    ("nanumgothic", "NanumGothic"),
    ("nanumgothicbold", "NanumGothic"),
    ("notosanscjkkr", "Noto Sans CJK KR"),
    ("notosanscjk", "Noto Sans CJK KR"),
    ("notoserifcjkkr", "Noto Serif CJK KR"),
    ("undotum", "UnDotum"),
]

# 한국어 신경망 음성 (edge-tts)
KOREAN_TTS_VOICES = {
    "ko-KR-SunHiNeural": "선희 · 여성",
    "ko-KR-InJoonNeural": "인준 · 남성",
    "ko-KR-HyunsuMultilingualNeural": "현수 · 남성",
}
DEFAULT_TTS_VOICE = "ko-KR-SunHiNeural"
# 쇼트폼 기본기: 조금 빠르고(+18%) 조금 높은(+5Hz) 목소리
DEFAULT_TTS_RATE = 18.0
DEFAULT_TTS_PITCH = 5.0

# 컷별 카메라 무빙 — zoompan 식으로 풀어 씁니다.
# z0/z1: 시작·끝 줌, x0/x1/y: 화면 안에서 바라보는 지점(0=왼쪽/위, 1=오른쪽/아래)
CAMERA_MOVES = {
    "push": dict(z0=1.00, z1=1.14, x0=0.50, x1=0.50, y=0.40),
    "pull": dict(z0=1.16, z1=1.00, x0=0.50, x1=0.50, y=0.38),
    "punch": dict(z0=1.30, z1=1.46, x0=0.28, x1=0.60, y=0.24),
    "drift": dict(z0=1.16, z1=1.32, x0=0.20, x1=0.80, y=0.26),
}

SR = 22050  # BGM 합성 샘플레이트 (가볍게)
BANNER_HEIGHT = 154  # 1080×1920 기준 상단 배너 높이(px)
PROGRESS_HEIGHT = 10

# 자막/배너에 쓰면 폰트에 글리프가 없어 네모(두부)로 보이는 문자들
_EMOJI_RE = re.compile(
    "[" "\U0001F000-\U0001FAFF" "\U00002600-\U000027BF" "\U0001F1E6-\U0001F1FF"
    "\U00002B00-\U00002BFF" "\U0000FE00-\U0000FE0F" "\U0000200D" "]"
)


def log(message: str) -> None:
    print(message, flush=True)


def die(message: str, code: int = 1):
    print(f"오류: {message}", file=sys.stderr, flush=True)
    sys.exit(code)


# ---------------------------------------------------------------------------
# 작은 유틸
# ---------------------------------------------------------------------------
def hex_rgb(value: str):
    value = value.strip().lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    if len(value) < 6:
        value = "fde047"
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def ass_color(value: str, alpha: int = 0) -> str:
    r, g, b = hex_rgb(value)
    return f"&H{alpha:02X}{b:02X}{g:02X}{r:02X}"


def ass_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours}:{minutes:02d}:{secs:05.2f}"


def srt_time(seconds: float) -> str:
    ms = int(round(max(0.0, seconds) * 1000))
    return f"{ms // 3600000:02d}:{(ms % 3600000) // 60000:02d}:{(ms % 60000) // 1000:02d},{ms % 1000:03d}"


def strip_marks(text: str) -> str:
    return _EMOJI_RE.sub("", text.replace("*", "")).strip()


def strip_emoji(text: str) -> str:
    """글리프가 없는 이모지를 지우되 앞뒤 공백은 건드리지 않습니다(자막 띄어쓰기 보존)."""
    return _EMOJI_RE.sub("", text)


# ---------------------------------------------------------------------------
# PNG 생성 (외부 라이브러리 없이)
# ---------------------------------------------------------------------------
def _png_chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path: Path, width: int, height: int, rows: list[bytes], color_type: int) -> None:
    raw = b"".join(rows)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", zlib.compress(raw, 6))
        + _png_chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def make_gradient_png(path: Path, c_from: str, c_to: str, width: int = 270, height: int = 480) -> None:
    """1080×1920으로 확대할 저해상도 그라디언트 (렌더 속도를 위해 작게 만듭니다)."""
    r0, g0, b0 = hex_rgb(c_from)
    r1, g1, b1 = hex_rgb(c_to)
    rows: list[bytes] = []
    cx, cy = 0.72, 0.16
    for y in range(height):
        ty = y / (height - 1)
        row = bytearray([0])
        for x in range(width):
            tx = x / (width - 1)
            t = min(1.0, max(0.0, 0.32 * tx + 0.72 * ty))
            r = r0 + (r1 - r0) * t
            g = g0 + (g1 - g0) * t
            b = b0 + (b1 - b0) * t
            dx = (tx - cx) * 0.9
            dy = (ty - cy) * 1.4
            glow = max(0.0, 1.0 - math.hypot(dx, dy) / 0.62) ** 2
            r += glow * 42
            g += glow * 40
            b += glow * 46
            row += bytes((
                min(255, int(r)),
                min(255, int(g)),
                min(255, int(b)),
            ))
        rows.append(bytes(row))
    write_png(path, width, height, rows, color_type=2)


def make_scrim_png(path: Path, width: int = 108, height: int = 192) -> None:
    """위·아래를 어둡게 덮는 반투명 그라디언트 (RGBA)."""
    rows: list[bytes] = []
    for y in range(height):
        ty = y / (height - 1)
        if ty < 0.30:
            alpha = 0.30 * (1.0 - ty / 0.30) ** 1.1
        elif ty > 0.62:
            alpha = 0.58 * ((ty - 0.62) / 0.38) ** 1.35
        else:
            alpha = 0.0
        a = int(min(255, alpha * 255))
        rows.append(bytes([0] + [0, 0, 0, a] * width))
    write_png(path, width, height, rows, color_type=6)


def make_banner_png(path: Path, accent: str, width: int = 270, height: int = 40) -> None:
    """상단 주제 배너 — 어두운 띠 + 아래쪽 강조색 라인, 아래 모서리만 둥글게 (RGBA)."""
    ar, ag, ab = hex_rgb(accent)
    line = 2  # 확대하면 8px
    radius = 7.0
    rows: list[bytes] = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            alpha = 1.0
            if y >= height - radius - 1:
                cx = None
                if x <= radius:
                    cx = radius
                elif x >= width - radius - 1:
                    cx = width - radius - 1
                if cx is not None:
                    dist = math.hypot(x - cx, y - (height - radius - 1))
                    if dist > radius - 0.5:
                        alpha = max(0.0, min(1.0, radius + 0.5 - dist))
            if y >= height - line:
                r, g, b = ar, ag, ab
                a = int(255 * alpha)
            else:
                t = y / max(1, height - line - 1)
                shade = 1.0 - 0.16 * t
                r = int(16 * shade)
                g = int(15 * shade)
                b = int(24 * shade)
                a = int(214 * alpha)
            row += bytes((max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)), max(0, min(255, a))))
        rows.append(bytes(row))
    write_png(path, width, height, rows, color_type=6)


# ---------------------------------------------------------------------------
# BGM 합성 (ffmpeg의 sine/aevalsrc 없이 WAV를 직접 만듭니다)
# ---------------------------------------------------------------------------
SINE_TABLE = [math.sin(2 * math.pi * i / 4096) for i in range(4096)]


def _add_tone(buf: list, start: int, length: int, freq: float, gain: float,
              attack: float, release: float, sr: int = SR) -> None:
    if gain <= 0 or length <= 0:
        return
    total = len(buf)
    step = freq * 4096.0 / sr
    phase = 0.0
    attack_n = max(1, int(attack * sr))
    release_n = max(1, int(release * sr))
    for i in range(length):
        index = start + i
        if index < 0:
            continue
        if index >= total:
            break
        if i < attack_n:
            env = i / attack_n
        elif i > length - release_n:
            env = max(0.0, (length - i) / release_n)
        else:
            env = 1.0
        buf[index] += SINE_TABLE[int(phase) & 4095] * gain * env
        phase += step


def _add_kick(buf: list, start: int, sr: int = SR) -> None:
    total = len(buf)
    length = int(0.20 * sr)
    phase = 0.0
    for i in range(length):
        index = start + i
        if index >= total:
            break
        freq = 130.0 * math.exp(-12.0 * i / length) + 45.0
        phase += freq * 4096.0 / sr
        env = math.exp(-9.0 * i / length)
        buf[index] += SINE_TABLE[int(phase) & 4095] * 0.30 * env


def _noise_burst(buf: list, start: int, length: float, gain: float, decay: float,
                 smooth: float, seed: int, sr: int = SR) -> None:
    """짧은 노이즈 버스트 — 하이햇·박수 소리를 코드로 만듭니다."""
    total = len(buf)
    n = max(1, int(length * sr))
    state = (seed * 1103515245 + 12345) & 0x7FFFFFFF
    lp = 0.0
    for i in range(n):
        index = start + i
        if index < 0:
            continue
        if index >= total:
            break
        state = (1103515245 * state + 12345) & 0x7FFFFFFF
        noise = (state / 0x7FFFFFFF) * 2.0 - 1.0
        lp += (noise - lp) * smooth
        env = math.exp(-decay * i / n)
        buf[index] += lp * gain * env


def _add_hat(buf: list, start: int, gain: float = 0.05, sr: int = SR, seed: int = 7) -> None:
    _noise_burst(buf, start, 0.045, gain, 26.0, 0.85, seed, sr=sr)


def _add_clap(buf: list, start: int, gain: float = 0.09, sr: int = SR, seed: int = 11) -> None:
    _noise_burst(buf, start, 0.13, gain, 12.0, 0.45, seed, sr=sr)


def _add_bass(buf: list, start: int, note: float, gain: float = 0.12, sr: int = SR) -> None:
    """짧게 끊기는 베이스 — 곡에 추진력을 줍니다."""
    total = len(buf)
    length = int(0.26 * sr)
    step = note * 4096.0 / sr
    phase = 0.0
    for i in range(length):
        index = start + i
        if index >= total:
            break
        env = min(1.0, i / (0.01 * sr)) * math.exp(-5.5 * i / length)
        buf[index] += SINE_TABLE[int(phase) & 4095] * gain * env
        phase += step


def make_bgm_wav(path: Path, mood: str, seconds: float, volume: float = 1.0) -> bool:
    config = BGM_MOODS.get(mood)
    if not config or seconds <= 0:
        return False

    sr = SR
    total = int(seconds * sr) + sr // 2
    buf = [0.0] * total
    beat = 60.0 / config["bpm"]
    bar = beat * 4
    bars = int(math.ceil(seconds / bar)) + 1
    base = 220.0

    for b in range(bars):
        chord = config["chords"][b % len(config["chords"])]
        start = int(b * bar * sr)
        length = int(bar * sr)
        for index, semi in enumerate(chord):
            freq = base * (2 ** (semi / 12))
            gain = config["pad"] / max(1, len(chord)) * (1.0 + 0.08 * index)
            _add_tone(buf, start, length, freq, gain, attack=bar * 0.28, release=bar * 0.5, sr=sr)
            # 살짝 디튠한 배음을 더해 두께를 냅니다
            _add_tone(buf, start + 13, length, freq * 1.003, gain * 0.5,
                      attack=bar * 0.3, release=bar * 0.55, sr=sr)

        if config["kick"]:
            for k in (0, 2):
                _add_kick(buf, start + int(k * beat * sr), sr=sr)

        groove = config.get("groove")
        if groove:
            for k in groove.get("kick", []):
                _add_kick(buf, start + int(k * beat * sr), sr=sr)
            for k in groove.get("clap", []):
                _add_clap(buf, start + int(k * beat * sr), seed=b * 7 + k)
            hat_rate = groove.get("hat", 0)
            for e in range(4 * hat_rate):
                _add_hat(buf, start + int(e * beat / hat_rate * sr), seed=b * 13 + e)
            bass = groove.get("bass", 0.0)
            if bass > 0:
                for k in range(4):
                    if k == 0 or k in groove.get("clap", []) or config["arp"]:
                        note = base * (2 ** ((chord[0] - 24) / 12))
                        _add_bass(buf, start + int(k * beat * sr), note, gain=bass)

        if config["arp"]:
            for e in range(8):
                note = chord[e % len(chord)] + 12
                freq = base * (2 ** (note / 12))
                _add_tone(buf, start + int(e * beat / 2 * sr), int(0.22 * sr), freq,
                          gain=0.075 * (1.0 - 0.04 * e), attack=0.006, release=0.16, sr=sr)

    # 간단한 저역 통과로 부드럽게 (밝은 곡은 하이햇이 살아 있게 덜 깎습니다)
    alpha = 0.22 + 0.62 * config["bright"]
    prev = 0.0
    for i in range(total):
        prev += (buf[i] - prev) * alpha
        buf[i] = prev

    peak = max((abs(v) for v in buf), default=0.0)
    if peak < 1e-6:
        return False
    scale = (0.82 / peak) * max(0.0, min(1.0, volume))
    frames = bytearray()
    for value in buf:
        sample = int(max(-1.0, min(1.0, value * scale)) * 32767)
        frames += struct.pack("<h", sample)

    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sr)
        handle.writeframes(bytes(frames))
    return True


def make_sfx_wav(path: Path, total_seconds: float, boundaries: list[float], volume: float = 0.16) -> bool:
    """컷이 바뀔 때마다 짧게 깔리는 전환 효과음(휙 + 틱).

    소리를 들어보지 않고도 예측 가능한 수준으로만 넣습니다: 짧은 노이즈 스윕 + 아주 작은 틱.
    """
    if not boundaries or total_seconds <= 0:
        return False
    sr = SR
    total = int(total_seconds * sr) + 1
    buf = [0.0] * total
    seed = 20260714

    def rand() -> float:
        nonlocal seed
        seed = (1103515245 * seed + 12345) & 0x7FFFFFFF
        return (seed / 0x7FFFFFFF) * 2.0 - 1.0

    for t in boundaries:
        # 휙 — 컷 직전 0.18초, 위로 스윕하는 노이즈
        whoosh = int(0.20 * sr)
        start = int((t - 0.20) * sr)
        lp = 0.0
        for i in range(whoosh):
            index = start + i
            if index < 0 or index >= total:
                continue
            p = i / whoosh
            cutoff = 0.06 + 0.55 * p * p
            lp += (rand() - lp) * cutoff
            env = (p ** 1.6) * (1.0 - max(0.0, (p - 0.85) / 0.15))
            buf[index] += lp * env * 0.55
        # 틱 — 컷 순간의 아주 짧은 고음
        tick = int(0.035 * sr)
        start = int(t * sr)
        for i in range(tick):
            index = start + i
            if index < 0 or index >= total:
                continue
            env = math.exp(-26.0 * i / tick)
            buf[index] += math.sin(2 * math.pi * 1650.0 * i / sr) * env * 0.22

    peak = max((abs(v) for v in buf), default=0.0)
    if peak < 1e-6:
        return False
    scale = (volume / peak)
    frames = bytearray()
    for value in buf:
        frames += struct.pack("<h", int(max(-1.0, min(1.0, value * scale)) * 32767))
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sr)
        handle.writeframes(bytes(frames))
    return True


# ---------------------------------------------------------------------------
# 폰트 · FFmpeg 찾기
# ---------------------------------------------------------------------------
def find_font(explicit: str | None, family: str | None):
    if explicit:
        path = Path(explicit).expanduser()
        if not path.exists():
            die(f"폰트 파일을 찾지 못했습니다: {path}")
        return path, family or guess_family(path)

    for candidate in FONT_CANDIDATES:
        path = Path(candidate)
        if path.exists():
            return path, family or guess_family(path)

    fc_match = shutil.which("fc-match")
    if fc_match:
        for query in ("Noto Sans CJK KR:bold", "Noto Sans CJK KR", "NanumGothic", "sans-serif:lang=ko"):
            try:
                out = subprocess.run([fc_match, "-f", "%{file}", query],
                                     capture_output=True, text=True, timeout=10).stdout.strip()
            except Exception:
                out = ""
            if out and Path(out).exists():
                return Path(out), family or guess_family(Path(out))

    die(
        "한글 폰트를 찾지 못했습니다. --font 옵션으로 폰트 파일을 지정해 주세요.\n"
        "  예) python3 scripts/render_shorts.py project.json --font /System/Library/Fonts/AppleSDGothicNeo.ttc"
    )


def guess_family(path: Path) -> str | None:
    fc_list = shutil.which("fc-list")
    if fc_list:
        try:
            out = subprocess.run([fc_list, "-f", "%{family}\n", str(path)],
                                 capture_output=True, text=True, timeout=10).stdout.strip()
            if out:
                first = out.splitlines()[0].split(",")[0].strip()
                if first:
                    return first
        except Exception:
            pass
    name = path.name.lower().replace(" ", "").replace("-", "")
    for needle, family in FAMILY_HINTS:
        if needle in name:
            return family
    return None


def find_ffmpeg(explicit: str | None) -> str:
    candidates = []
    if explicit:
        candidates.append(explicit)
    if os.environ.get("FFMPEG"):
        candidates.append(os.environ["FFMPEG"])
    found = shutil.which("ffmpeg")
    if found:
        candidates.append(found)
    # 파이썬 패키지에 딸려 오는 정적 ffmpeg (설치 없이도 바로 렌더)
    try:
        import imageio_ffmpeg  # type: ignore

        candidates.append(imageio_ffmpeg.get_ffmpeg_exe())
    except Exception:
        pass
    candidates.extend(["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"])

    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    die(
        "FFmpeg를 찾지 못했습니다.\n"
        "  맥: brew install ffmpeg\n"
        "  윈도우: winget install ffmpeg  (또는 https://ffmpeg.org 에서 받아 PATH 추가)\n"
        "  설치 후 터미널을 다시 열거나 --ffmpeg 옵션으로 경로를 지정해 주세요."
    )
    return "ffmpeg"


def find_edge_tts() -> list[str] | None:
    """edge-tts 실행 명령을 찾습니다. CLI가 없으면 파이썬 모듈로 실행합니다."""
    found = shutil.which("edge-tts")
    if found:
        return [found]
    probe = subprocess.run([sys.executable, "-c", "import edge_tts"], capture_output=True, text=True)
    if probe.returncode == 0:
        return [sys.executable, "-m", "edge_tts"]
    return None


def find_espeak() -> str | None:
    return shutil.which("espeak-ng") or shutil.which("espeak")


# ---------------------------------------------------------------------------
# 프로젝트 정규화
# ---------------------------------------------------------------------------
def normalize(raw: dict) -> dict:
    cuts_raw = raw.get("cuts") or []
    if not cuts_raw:
        die("프로젝트에 컷이 없습니다. 스튜디오에서 컷을 한 개 이상 만들어 주세요.")

    if "style" in raw and "canvas" in raw:
        style = raw["style"]
        canvas = raw.get("canvas") or {}
        project = raw.get("project") or {}
    else:
        # 스튜디오가 저장한 Project 형식도 그대로 받습니다
        style = {
            "subtitle": raw.get("subtitle") or {},
            "headline": raw.get("headline") or {},
            "voice": raw.get("voice") or {},
            "bgm": raw.get("bgm") or {},
            "banner": raw.get("banner") or {},
        }
        canvas = {}
        project = raw

    subtitle = style.get("subtitle") or {}
    headline = style.get("headline") or {}
    voice = style.get("voice") or {}
    bgm = style.get("bgm") or {}
    banner = style.get("banner") or {}
    tts = voice.get("tts") or {}

    cuts = []
    for index, cut in enumerate(cuts_raw):
        try:
            duration = float(cut.get("duration", 4))
        except (TypeError, ValueError):
            duration = 4.0
        duration = max(0.5, min(30.0, duration))
        cuts.append({
            "index": index,
            "id": cut.get("id") or f"cut{index}",
            "role": cut.get("role") or "body",
            "headline": str(cut.get("headline") or ""),
            "subtitle": str(cut.get("subtitle") or ""),
            "narration": str(cut.get("narration") or ""),
            "duration": duration,
            "theme": cut.get("theme") if cut.get("theme") in THEMES else "sunset",
            "camera": cut.get("camera") if cut.get("camera") in CAMERA_MOVES else "auto",
            "image": cut.get("image") or None,
            "audio": cut.get("audio") or None,
        })

    banner_text = strip_emoji(str(banner.get("text") or "")).strip()
    return {
        "title": str(project.get("title") or "shorts"),
        "width": int(canvas.get("width") or 1080),
        "height": int(canvas.get("height") or 1920),
        "fps": int(canvas.get("fps") or 30),
        "subtitle": {
            "position": subtitle.get("position") or "bottom",
            "sizePx": float(subtitle.get("sizePx") or 66),
            "color": subtitle.get("color") or "#ffffff",
            "highlight": subtitle.get("highlight") or "#fde047",
            "outline": float(subtitle.get("outline") or 3),
        },
        "headline_style": {
            "enabled": bool(headline.get("enabled", True)),
            "sizePx": float(headline.get("sizePx") or 84),
        },
        "banner": {
            "enabled": bool(banner.get("enabled", bool(banner_text))),
            "text": banner_text,
        },
        "voice": {
            "name": voice.get("name") or "",
            "lang": voice.get("lang") or "ko-KR",
            "rate": float(voice.get("rate") or 1.0),
            "pitch": float(voice.get("pitch") or 1.0),
            "tts": {
                "engine": str(tts.get("engine") or "edge"),
                "voice": str(tts.get("voice") or DEFAULT_TTS_VOICE),
                "ratePct": float(tts["ratePct"]) if tts.get("ratePct") is not None else DEFAULT_TTS_RATE,
                "pitchHz": float(tts["pitchHz"]) if tts.get("pitchHz") is not None else DEFAULT_TTS_PITCH,
            },
        },
        "bgm": {
            "mood": bgm.get("mood") or "none",
            "volume": float(bgm.get("volume") if bgm.get("volume") is not None else 0.2),
        },
        "cuts": cuts,
    }


def decode_data_url(data_url: str) -> bytes:
    if "," in data_url:
        _, payload = data_url.split(",", 1)
    else:
        payload = data_url
    return base64.b64decode(payload)


def resolve_image(cut: dict, base_dir: Path) -> tuple[bytes, str] | None:
    """data URL · 상대 경로 · /public 경로 어느 쪽이든 이미지 바이트로 풀어냅니다."""
    image = cut.get("image")
    if not image:
        return None
    source = str(image.get("dataUrl") or image.get("data_url") or image.get("src") or "")
    if not source:
        return None
    name = str(image.get("name") or "")
    suffix = Path(name).suffix.lower() or ".png"

    if source.startswith("data:"):
        header = source.split(",", 1)[0]
        if "image/" in header:
            ext = header.split("image/")[1].split(";")[0]
            suffix = "." + (ext if ext in ("png", "jpeg", "jpg", "webp") else "png")
        return decode_data_url(source), suffix

    candidates = [Path(source)]
    if base_dir:
        candidates.append(base_dir / source)
        candidates.append(base_dir / ".." / source)
        candidates.append(base_dir / "public" / source)
    if source.startswith("/"):
        trimmed = source.lstrip("/")
        candidates.append(base_dir / trimmed if base_dir else Path(trimmed))
        candidates.append(Path(__file__).resolve().parent.parent / "public" / trimmed)
    for candidate in candidates:
        try:
            resolved = candidate.expanduser()
            if resolved.is_file():
                return resolved.read_bytes(), (resolved.suffix.lower() or ".png")
        except OSError:
            continue
    die(f"{cut['index'] + 1}번 컷 이미지를 찾지 못했습니다: {source[:120]}")
    return None


# ---------------------------------------------------------------------------
# ASS 자막
# ---------------------------------------------------------------------------
def ass_escape(text: str) -> str:
    text = text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")
    return text.replace("\r", "").replace("\n", "\\N")


def highlight_to_ass(text: str, highlight: str, base: str) -> str:
    """*별표* 안의 단어는 강조색 + 살짝 튀는 팝 애니메이션을 줍니다."""
    pieces = []
    for part in re.split(r"(\*[^*]+\*)", text):
        if not part:
            continue
        if part.startswith("*") and part.endswith("*") and len(part) > 2:
            pieces.append(
                f"{{\\c{ass_color(highlight)}\\fscx112\\fscy112\\t(0,150,\\fscx100\\fscy100)}}"
                f"{ass_escape(strip_emoji(part[1:-1]))}{{\\c{ass_color(base)}\\fscx100\\fscy100}}"
            )
        else:
            pieces.append(ass_escape(strip_emoji(part)))
    return "".join(pieces)


def build_ass(project: dict, font_family: str, path: Path) -> None:
    width = project["width"]
    height = project["height"]
    sub = project["subtitle"]
    head = project["headline_style"]
    banner = project["banner"]
    accent = _accent_for(project)

    align = {"top": 8, "middle": 5, "bottom": 2}.get(sub["position"], 2)
    margin_v = {"top": int(BANNER_HEIGHT + 70), "middle": 0, "bottom": int(height * 0.142)}[sub["position"]]

    size = sub["sizePx"]
    outline = max(3.0, sub["outline"]) * 1.9 + 1.2      # 두꺼운 검정 테두리 = 쇼츠 느낌
    shadow = max(2.0, size * 0.045)
    head_size = head["sizePx"]
    head_margin = BANNER_HEIGHT + 34 if banner["enabled"] else int(height * 0.075)

    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: TV.709",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Head,{font_family},{head_size:.0f},{ass_color('#ffffff')},{ass_color('#ffffff')},"
        f"&H00000000,&HA0000000,-1,0,0,0,100,100,0,0,1,{max(5.0, head_size * 0.10):.1f},{max(3.0, head_size * 0.05):.1f},"
        f"8,60,60,{head_margin},1",
        f"Style: Sub,{font_family},{size:.0f},{ass_color(sub['color'])},{ass_color(sub['color'])},"
        f"&H00000000,&HA0000000,-1,0,0,0,100,100,0.4,0,1,{outline:.1f},{shadow:.1f},{align},60,60,{margin_v},1",
        f"Style: Banner,{font_family},{int(height * 0.0305)},{ass_color(accent)},{ass_color(accent)},"
        f"&H00000000,&H00000000,-1,0,0,0,100,100,1.0,0,1,0,0,8,60,60,{int(BANNER_HEIGHT * 0.30)},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    total = sum(cut["duration"] for cut in project["cuts"])

    if banner["enabled"] and banner["text"]:
        lines.append(
            f"Dialogue: 2,{ass_time(0)},{ass_time(total)},Banner,,0,0,0,,"
            f"{{\\fad(0,0)}}{ass_escape(banner['text'])}"
        )

    clock = 0.0
    for cut in project["cuts"]:
        start = clock
        end = clock + cut["duration"]
        clock = end

        if head["enabled"] and strip_emoji(cut["headline"]).strip():
            joined = ass_escape(strip_emoji(cut["headline"]).strip())
            lines.append(
                f"Dialogue: 1,{ass_time(start)},{ass_time(end)},Head,,0,0,0,,"
                f"{{\\fad(200,180)\\fscx92\\fscy92\\t(0,220,\\fscx100\\fscy100)}}{joined}"
            )

        sub_text = strip_emoji(cut["subtitle"]).strip() or strip_emoji(cut["narration"]).strip()
        if sub_text:
            inner = highlight_to_ass(sub_text, sub["highlight"], sub["color"])
            lines.append(
                f"Dialogue: 3,{ass_time(start + 0.08)},{ass_time(max(start + 0.25, end - 0.06))},Sub,,0,0,0,,"
                f"{{\\fad(90,110)\\fscx86\\fscy86\\t(0,150,\\fscx100\\fscy100)}}{inner}"
            )

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _accent_for(project: dict) -> str:
    highlight = (project.get("subtitle") or {}).get("highlight") or "#fde047"
    return highlight


def build_srt(project: dict, path: Path) -> None:
    blocks = []
    clock = 0.0
    for cut in project["cuts"]:
        start = clock
        end = clock + cut["duration"]
        clock = end
        text = strip_marks(cut["subtitle"]).strip() or strip_marks(cut["narration"]).strip()
        if not text:
            continue
        blocks.append(f"{len(blocks) + 1}\n{srt_time(start)} --> {srt_time(end)}\n{text}\n")
    path.write_text("\n".join(blocks), encoding="utf-8")


# ---------------------------------------------------------------------------
# 렌더 단계
# ---------------------------------------------------------------------------
def run(cmd: list[str], label: str, cwd: Path | None = None) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(cwd) if cwd else None)
    if result.returncode != 0:
        tail = (result.stderr or "").strip().splitlines()[-12:]
        die(f"{label} 실패\n" + "\n".join(tail))
    if result.stderr and os.environ.get("SHORTCUT_VERBOSE"):
        log(result.stderr.strip())


def probe_duration(ffmpeg: str, path: Path) -> float | None:
    result = subprocess.run(
        [ffmpeg, "-hide_banner", "-i", str(path), "-f", "null", "-"],
        capture_output=True, text=True,
    )
    match = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", result.stderr or "")
    if not match:
        return None
    return int(match.group(1)) * 3600 + int(match.group(2)) * 60 + float(match.group(3))


def fit_cut_durations_to_audio(project: dict, ffmpeg: str, tmp: Path) -> list[tuple[int, float]]:
    """녹음이 컷보다 길면 컷 길이를 녹음에 맞춰 늘립니다."""
    adjusted: list[tuple[int, float]] = []
    for cut in project["cuts"]:
        if not cut["audio"]:
            continue
        suffix = Path(str(cut["audio"].get("name") or "audio.webm")).suffix.lower() or ".webm"
        source = tmp / f"fit-{cut['index']:02d}{suffix}"
        source.write_bytes(decode_data_url(cut["audio"]["dataUrl"]))
        length = probe_duration(ffmpeg, source)
        source.unlink(missing_ok=True)
        if length and length > cut["duration"] + 0.1:
            cut["duration"] = min(30.0, round(length + 0.15, 1))
            adjusted.append((cut["index"], cut["duration"]))
    return adjusted


def synth_espeak(espeak: str, text: str, out_wav: Path, rate: float, pitch: float) -> bool:
    speed = max(80, min(320, int(160 * rate)))
    pitch_value = max(0, min(99, int(50 * pitch)))
    try:
        subprocess.run([espeak, "-v", "ko", "-s", str(speed), "-p", str(pitch_value), "-w", str(out_wav), text],
                       capture_output=True, text=True, timeout=60)
        return out_wav.exists() and out_wav.stat().st_size > 1000
    except Exception:
        return False


def synth_edge(cmd: list[str], text: str, out_mp3: Path, voice: str, rate_pct: float, pitch_hz: float) -> bool:
    rate = f"{rate_pct:+.0f}%"
    pitch = f"{pitch_hz:+.0f}Hz"
    try:
        result = subprocess.run(
            [*cmd, "--voice", voice, f"--rate={rate}", f"--pitch={pitch}",
             "--text", text, "--write-media", str(out_mp3)],
            capture_output=True, text=True, timeout=120,
        )
        return result.returncode == 0 and out_mp3.exists() and out_mp3.stat().st_size > 1500
    except Exception:
        return False


def prepare_tts(project: dict, ffmpeg: str, tmp: Path, voice_mode: str) -> tuple[dict[int, Path], list[str], str]:
    """나레이션을 미리 합성하고, 목소리가 컷보다 길면 컷 길이를 늘립니다.

    반환: ({컷 index: 오디오 파일}, 경고, 실제로 쓴 엔진 이름)
    """
    warnings: list[str] = []
    files: dict[int, Path] = {}
    if voice_mode == "none":
        return files, warnings, "none"

    total_audio_cuts = sum(1 for cut in project["cuts"] if cut["audio"])
    if total_audio_cuts == len(project["cuts"]):
        return files, warnings, "recorded"

    engine = "none"
    edge_cmd = find_edge_tts() if voice_mode in ("auto", "edge") else None
    espeak = find_espeak() if voice_mode in ("auto", "espeak") else None

    tts_conf = project["voice"]["tts"]
    rate_pct = tts_conf["ratePct"] + (project["voice"]["rate"] - 1.0) * 100.0
    pitch_hz = tts_conf["pitchHz"]

    for cut in project["cuts"]:
        if cut["audio"]:
            continue
        text = strip_marks(cut["narration"]) or strip_marks(cut["subtitle"])
        text = text.strip()
        if not text:
            continue

        made: Path | None = None
        if edge_cmd and engine != "espeak":
            candidate = tmp / f"tts-{cut['index']:02d}.mp3"
            if synth_edge(edge_cmd, text, candidate, tts_conf["voice"], rate_pct, pitch_hz):
                made = candidate
                engine = "edge"
            else:
                warnings.append("edge-tts 합성에 실패했습니다. 인터넷 연결을 확인해 주세요.")
                if voice_mode == "edge":
                    edge_cmd = None

        if made is None and espeak and voice_mode != "edge":
            candidate = tmp / f"tts-{cut['index']:02d}.wav"
            if synth_espeak(espeak, text, candidate, project["voice"]["rate"], project["voice"]["pitch"]):
                made = candidate
                engine = "espeak"

        if made is None:
            continue

        files[cut["index"]] = made
        length = probe_duration(ffmpeg, made) or 0.0
        # 쇼츠 템포 보호: 15%까지는 목소리를 당겨서 컷 길이를 지키고,
        # 그보다 길 때만 그 컷을 늘립니다 (잘림 방지).
        if length > cut["duration"] * 1.15:
            cut["duration"] = min(30.0, round(length + 0.25, 2))

    return files, warnings, engine


def build_segments(project: dict, ffmpeg: str, tmp: Path, base_dir: Path) -> tuple[list[Path], float]:
    width, height, fps = project["width"], project["height"], project["fps"]
    segments: list[Path] = []
    clock = 0.0
    # 켄번즈를 위해 원본을 1.45배로 키워 둡니다 (타이트한 펀치인에도 덜 뭉개지게)
    big_w, big_h = int(width * 1.45) // 2 * 2, int(height * 1.45) // 2 * 2
    total_cuts = len(project["cuts"])

    for cut in project["cuts"]:
        frames = max(2, int(round(cut["duration"] * fps)))
        out = tmp / f"seg-{cut['index']:02d}.mp4"

        resolved = resolve_image(cut, base_dir)
        if resolved:
            data, suffix = resolved
            image_path = tmp / f"bg-{cut['index']:02d}{suffix}"
            image_path.write_bytes(data)
        else:
            c_from, c_to, _ = THEMES[cut["theme"]]
            image_path = tmp / f"bg-{cut['index']:02d}.png"
            make_gradient_png(image_path, c_from, c_to)

        move = cut.get("camera")
        if move not in CAMERA_MOVES:
            # camera가 없거나 auto면 컷 순서에 맞춰 자동으로 (미리보기와 같은 규칙)
            if cut["index"] == 0:
                move = "push"
            elif cut["index"] == total_cuts - 1:
                move = "pull"
            elif cut["index"] % 2 == 1:
                move = "push"
            else:
                move = "drift"
        conf = CAMERA_MOVES[move]
        span = max(1, frames - 1)
        zoom = f"{conf['z0']:.3f}+{conf['z1'] - conf['z0']:.4f}*on/{span}"
        pan_x = f"(iw-iw/zoom)*({conf['x0']:.3f}+{conf['x1'] - conf['x0']:.4f}*on/{span})"
        pan_y = f"(ih-ih/zoom)*{conf['y']:.2f}"

        filter_complex = (
            f"[0:v]scale={big_w}:{big_h}:force_original_aspect_ratio=increase,"
            f"crop={big_w}:{big_h},setsar=1,"
            f"zoompan=z='{zoom}':x='{pan_x}':y='{pan_y}':d={frames}:s={width}x{height}:fps={fps},"
            f"format=yuv420p[v]"
        )

        run([
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(image_path),
            "-filter_complex", filter_complex,
            "-map", "[v]",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
            "-pix_fmt", "yuv420p", "-r", str(fps), "-g", str(fps * 2),
            "-t", f"{cut['duration']:.3f}",
            str(out),
        ], f"{cut['index'] + 1}번 컷 영상")

        segments.append(out)
        clock += cut["duration"]

    return segments, clock


def build_audio(project: dict, ffmpeg: str, tmp: Path, tts_files: dict[int, Path], engine: str) -> tuple[Path, list[str]]:
    warnings: list[str] = []
    parts: list[Path] = []

    for cut in project["cuts"]:
        out = tmp / f"aud-{cut['index']:02d}.wav"
        duration = cut["duration"]

        if cut["audio"]:
            suffix = ".webm"
            name = str((cut["audio"].get("name") or "audio"))
            if "." in name:
                ext = Path(name).suffix.lower()
                if ext in (".mp3", ".wav", ".m4a", ".aac", ".ogg", ".opus", ".webm", ".mp4"):
                    suffix = ext
            source = tmp / f"src-{cut['index']:02d}{suffix}"
            source.write_bytes(decode_data_url(cut["audio"]["dataUrl"]))
            source_len = probe_duration(ffmpeg, source) or 0.0
            if source_len > duration + 0.2:
                warnings.append(
                    f"{cut['index'] + 1}번 컷 녹음이 {source_len:.1f}초인데 컷 길이는 {duration:.1f}초입니다. "
                    f"잘렸습니다 — --fit-audio를 쓰면 늘어납니다."
                )
            run([
                ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                "-i", str(source),
                "-af", f"aresample=44100,apad,atrim=0:{duration:.3f},asetpts=N/SR/TB",
                "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le",
                str(out),
            ], f"{cut['index'] + 1}번 컷 오디오")
            parts.append(out)
            continue

        voice_file = tts_files.get(cut["index"])
        if voice_file and engine != "none":
            # 목소리가 컷보다 길면 최대 1.18배까지 당겨서 컷 길이 안에 넣습니다 (템포 유지).
            voice_len = probe_duration(ffmpeg, voice_file) or 0.0
            usable = max(0.3, duration - 0.16)
            speed = 1.0
            if voice_len > usable and voice_len > 0:
                speed = min(1.18, voice_len / usable)
            af = "aresample=44100"
            if speed > 1.005:
                af += f",atempo={speed:.3f}"
            af += f",adelay=80|80,apad,atrim=0:{duration:.3f},asetpts=N/SR/TB"
            run([
                ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                "-i", str(voice_file),
                "-af", af,
                "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le",
                str(out),
            ], f"{cut['index'] + 1}번 컷 목소리")
            parts.append(out)
            continue

        run([
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            "-t", f"{duration:.3f}",
            "-c:a", "pcm_s16le",
            str(out),
        ], f"{cut['index'] + 1}번 컷 무음")
        parts.append(out)

    if not parts:
        die("오디오 트랙을 만들지 못했습니다.")

    concat_file = tmp / "audio-list.txt"
    concat_file.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts), encoding="utf-8")
    narration = tmp / "narration.wav"
    run([
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", str(concat_file),
        "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2",
        str(narration),
    ], "나레이션 연결")
    return narration, warnings


def main() -> None:
    parser = argparse.ArgumentParser(description="쇼츠 프로젝트 JSON을 세로형 MP4로 조립합니다.")
    parser.add_argument("project", nargs="?", help="프로젝트 JSON 경로")
    parser.add_argument("-o", "--output", help="출력 mp4 경로 (기본: 프로젝트 이름.mp4)")
    parser.add_argument("--ffmpeg", help="ffmpeg 실행 파일 경로")
    parser.add_argument("--font", help="한글 폰트 파일 경로")
    parser.add_argument("--font-family", help="ASS에 쓸 폰트 패밀리 이름 (자동 감지 실패 시)")
    parser.add_argument("--voice", choices=["auto", "edge", "espeak", "none"], default="auto",
                        help="녹음 파일이 없는 컷의 음성 처리 (기본 auto: edge-tts → espeak → 무음)")
    parser.add_argument("--tts", default=None,
                        help=f"edge-tts 한국어 음성 (기본 {DEFAULT_TTS_VOICE}, 예: ko-KR-InJoonNeural)")
    parser.add_argument("--tts-rate", type=float, default=None,
                        help=f"AI 목소리 속도 보정 %%. 예: 12 → +12%% (기본 +{DEFAULT_TTS_RATE:.0f}%%)")
    parser.add_argument("--tts-pitch", type=float, default=None,
                        help=f"AI 목소리 음높이 보정 Hz (기본 +{DEFAULT_TTS_PITCH:.0f}Hz)")
    parser.add_argument("--list-tts", action="store_true", help="쓸 수 있는 한국어 AI 목소리를 보여줍니다")
    parser.add_argument("--banner", default=None, help="상단 주제 배너 문구 (--no-banner로 끕니다)")
    parser.add_argument("--no-banner", action="store_true", help="상단 주제 배너를 넣지 않습니다")
    parser.add_argument("--no-progress", action="store_true", help="하단 진행바를 넣지 않습니다")
    parser.add_argument("--no-sfx", action="store_true", help="컷 전환 효과음을 넣지 않습니다")
    parser.add_argument("--no-bgm", action="store_true", help="BGM 없이 렌더")
    parser.add_argument("--crf", type=int, default=20, help="영상 품질 (기본 20, 낮을수록 고화질)")
    parser.add_argument("--preset", default="medium", help="x264 프리셋 (기본 medium)")
    parser.add_argument("--fit-audio", action="store_true",
                        help="녹음이 컷 길이보다 길면 컷 길이를 늘려 잘리지 않게 합니다")
    parser.add_argument("--srt-only", action="store_true", help="자막만 뽑고 끝냅니다")
    parser.add_argument("--keep-temp", action="store_true", help="중간 파일을 남깁니다")
    args = parser.parse_args()

    if args.list_tts:
        for voice, label in KOREAN_TTS_VOICES.items():
            log(f"{voice}  ·  {label}")
        available = "있음" if find_edge_tts() else "없음 (pip install edge-tts)"
        log(f"edge-tts: {available}")
        return

    if not args.project:
        die("프로젝트 JSON 경로를 넣어 주세요.  예) python3 scripts/render_shorts.py my.json -o out.mp4")
    project_path = Path(args.project).expanduser()
    if not project_path.exists():
        die(f"프로젝트 파일을 찾지 못했습니다: {project_path}")

    try:
        raw = json.loads(project_path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as error:
        die(f"JSON을 읽지 못했습니다: {error}")

    project = normalize(raw)
    if args.banner is not None:
        project["banner"]["text"] = strip_emoji(args.banner).strip()
        project["banner"]["enabled"] = bool(project["banner"]["text"])
    if args.no_banner:
        project["banner"]["enabled"] = False
    if args.tts:
        project["voice"]["tts"]["voice"] = args.tts
    if args.tts_rate is not None:
        project["voice"]["tts"]["ratePct"] = args.tts_rate
    if args.tts_pitch is not None:
        project["voice"]["tts"]["pitchHz"] = args.tts_pitch

    base_dir = project_path.parent.resolve()
    output = Path(args.output).expanduser() if args.output else project_path.with_suffix(".mp4")

    tmp = Path(tempfile.mkdtemp(prefix="shortcut-"))
    try:
        ffmpeg = find_ffmpeg(args.ffmpeg)
        font_path, font_family = find_font(args.font, args.font_family)
        if not font_family:
            font_family = font_path.stem
            log(f"· 폰트 패밀리를 확정하지 못해 파일명을 씁니다: {font_family} (문제가 있으면 --font-family)")
        log(f"· FFmpeg: {ffmpeg}")
        log(f"· 폰트: {font_path.name} ({font_family})")

        # 폰트를 임시 폴더로 복사해 두면 경로 이스케이프 문제 없이 libass가 폰트를 찾습니다.
        fonts_dir = tmp / "fonts"
        fonts_dir.mkdir(exist_ok=True)
        try:
            shutil.copy2(font_path, fonts_dir / font_path.name)
        except OSError:
            pass

        if args.fit_audio:
            adjusted = fit_cut_durations_to_audio(project, ffmpeg, tmp)
            for index, new_duration in adjusted:
                log(f"  · {index + 1}번 컷 길이를 {new_duration:.1f}초로 늘렸습니다 (녹음 길이에 맞춤)")

        log("[0/5] AI 목소리 만들기")
        tts_files, tts_warnings, engine = prepare_tts(project, ffmpeg, tmp, args.voice)
        for warning in tts_warnings:
            log(f"  ! {warning}")
        if engine == "edge":
            tts_conf = project["voice"]["tts"]
            log(f"  · edge-tts 한국어 음성 사용: {tts_conf['voice']} "
                f"({len(tts_files)}컷 · 속도 {tts_conf['ratePct']:+.0f}% · 음높이 {tts_conf['pitchHz']:+.0f}Hz)")
        elif engine == "espeak":
            log("  · espeak-ng 음성 사용 (edge-tts를 설치하면 훨씬 자연스럽습니다)")
        elif engine == "recorded":
            log("  · 모든 컷에 녹음이 있어 AI 목소리는 쓰지 않았습니다")
        else:
            log("  · 목소리 없음 (자막·BGM만). pip install edge-tts 로 AI 보이스를 쓸 수 있습니다")

        total = sum(cut["duration"] for cut in project["cuts"])
        log(f"· {len(project['cuts'])}컷 · {total:.1f}초")

        srt_path = output.with_suffix(".srt")
        build_srt(project, srt_path)
        log(f"· 자막: {srt_path}")
        if args.srt_only:
            log("SRT만 만들었습니다.")
            return

        ass_path = tmp / "subs.ass"
        build_ass(project, font_family, ass_path)

        scrim_path = tmp / "scrim.png"
        make_scrim_png(scrim_path)
        accent = _accent_for(project)
        banner_path = None
        if project["banner"]["enabled"] and project["banner"]["text"]:
            banner_path = tmp / "banner.png"
            make_banner_png(banner_path, accent)
            log(f"· 상단 배너: {project['banner']['text']}")

        log("[1/5] 컷 영상 만들기")
        segments, _ = build_segments(project, ffmpeg, tmp, base_dir)

        log("[2/5] 컷 영상 연결")
        concat_file = tmp / "video-list.txt"
        concat_file.write_text("".join(f"file '{p.as_posix()}'\n" for p in segments), encoding="utf-8")
        silent_video = tmp / "video.mp4"
        run([
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-c", "copy", str(silent_video),
        ], "영상 연결")

        log("[3/5] 오디오 만들기")
        narration, warnings = build_audio(project, ffmpeg, tmp, tts_files, engine)
        for warning in warnings:
            log(f"  ! {warning}")

        mood = "none" if args.no_bgm else project["bgm"]["mood"]
        mix_inputs = ["-i", str(narration)]
        next_input = 1
        filters = []
        voice_label = "[0:a]"
        labels = [voice_label]
        if mood in BGM_MOODS:
            bgm_path = tmp / "bgm.wav"
            # 스튜디오 볼륨(0~1)은 미리보기 기준이라 그대로 쓰면 MP4에서 너무 작습니다.
            # 쇼츠 믹스에선 3배로 올려 깔고, 목소리 구간은 사이드체인으로 눌러 줍니다.
            bgm_volume = min(1.0, project["bgm"]["volume"] * 3.0)
            if make_bgm_wav(bgm_path, mood, total, bgm_volume):
                mix_inputs += ["-i", str(bgm_path)]
                fade_out = max(0.1, total - 1.4)
                filters.append(
                    f"[{next_input}:a]volume=1.0,afade=t=in:st=0:d=1.2,afade=t=out:st={fade_out:.2f}:d=1.4,"
                    f"aformat=sample_rates=44100:channel_layouts=stereo[bgraw]"
                )
                if engine != "none":
                    # 목소리가 나올 때만 BGM을 눌러 줍니다(사이드체인 더킹) — 목소리는 또렷하게, BGM은 힘있게
                    filters.insert(0, "[0:a]asplit=2[voice][key]")
                    filters.append(
                        "[bgraw][key]sidechaincompress=threshold=0.035:ratio=6:attack=15:release=320[bg]"
                    )
                    voice_label = "[voice]"
                    labels = [voice_label, "[bg]"]
                else:
                    filters.append("[bgraw]anull[bg]")
                    labels.append("[bg]")
                next_input += 1

        if not args.no_sfx:
            boundaries: list[float] = []
            clock = 0.0
            for index, cut in enumerate(project["cuts"]):
                clock += cut["duration"]
                if index < len(project["cuts"]) - 1:
                    boundaries.append(clock)
            sfx_path = tmp / "sfx.wav"
            if boundaries and make_sfx_wav(sfx_path, total, boundaries, 0.13):
                mix_inputs += ["-i", str(sfx_path)]
                filters.append(f"[{next_input}:a]aformat=sample_rates=44100:channel_layouts=stereo[sfx]")
                labels.append("[sfx]")
                next_input += 1

        if len(labels) > 1:
            filters.append(
                f"{''.join(labels)}amix=inputs={len(labels)}:duration=first:dropout_transition=0:normalize=0[a]"
            )
        elif voice_label != "[0:a]":
            filters.append(f"{voice_label}anull[a]")
        else:
            filters.append("[0:a]anull[a]")

        mixed = tmp / "mix.wav"
        run([
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
            *mix_inputs,
            "-filter_complex", ";".join(filters),
            "-map", "[a]", "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2",
            str(mixed),
        ], "오디오 믹스")

        log("[4/5] 배너·자막·진행바 합성")
        output.parent.mkdir(parents=True, exist_ok=True)
        width, height = project["width"], project["height"]
        accent_hex = accent.lstrip("#")
        cr, cg, cb = hex_rgb(accent)

        inputs = ["-i", str(silent_video), "-i", str(scrim_path)]
        chain = (
            f"[1:v]scale={width}:{height},format=rgba[sc];"
            f"[0:v][sc]overlay=0:0[s1]"
        )
        last = "[s1]"
        nxt = 2
        if banner_path:
            inputs += ["-i", str(banner_path)]
            chain += f";[{nxt}:v]scale={width}:{BANNER_HEIGHT}:flags=lanczos,format=rgba[bn];{last}[bn]overlay=0:0[s2]"
            last = "[s2]"
            nxt += 1

        if not args.no_progress:
            bar_y = height - PROGRESS_HEIGHT - 6
            # 진행바 밑판(반투명 검정)은 정적 drawbox로, 채워지는 부분은 geq로 시간에 따라 그립니다.
            chain += (
                f";{last}drawbox=x=0:y={bar_y}:w=iw:h={PROGRESS_HEIGHT}:color=0x000000@0.45:t=fill[pt]"
            )
            last = "[pt]"
            progress_src = (
                f"color=c=black:s={width}x1:r={project['fps']}:d={total:.3f},format=rgba,"
                f"geq=r={cr}:g={cg}:b={cb}:a=255*lt(X\\,W*T/{total:.3f}),"
                f"scale={width}:{PROGRESS_HEIGHT}:flags=neighbor"
            )
            inputs += ["-f", "lavfi", "-i", progress_src]
            chain += f";{last}[{nxt}:v]overlay=0:{bar_y}:format=auto[pb]"
            last = "[pb]"
            nxt += 1

        chain += f";{last}ass=filename=subs.ass:fontsdir=fonts,format=yuv420p[v]"

        log("[5/5] 최종 인코딩")
        inputs += ["-i", str(mixed)]
        chain += f";[{nxt}:a]loudnorm=I=-14:TP=-1.5:LRA=11[a]"

        run([
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
            *inputs,
            "-filter_complex", chain,
            "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-preset", args.preset, "-crf", str(args.crf),
            "-profile:v", "high", "-pix_fmt", "yuv420p", "-color_range", "tv", "-r", str(project["fps"]),
            "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
            "-movflags", "+faststart", "-t", f"{total:.3f}",
            str(output),
        ], "최종 인코딩", cwd=tmp)

        size_mb = output.stat().st_size / 1024 / 1024 if output.exists() else 0
        log(f"✅ 완성: {output}  ({size_mb:.1f} MB · {width}×{height} · {total:.1f}초)")
        if engine == "none":
            log("   참고: 목소리가 들어가지 않았습니다(자막·BGM만). pip install edge-tts 로 AI 보이스를 켜세요.")
    finally:
        if args.keep_temp:
            log(f"· 임시 파일: {tmp}")
        else:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
