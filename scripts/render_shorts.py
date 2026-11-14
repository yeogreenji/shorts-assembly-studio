#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
숏컷 스튜디오 — 프로젝트 JSON을 세로형 쇼츠 MP4(1080×1920)로 조립합니다.

사용 예
    python3 scripts/render_shorts.py my_project.json -o out.mp4
    python3 scripts/render_shorts.py my_project.json --fps 30 --crf 20
    python3 scripts/render_shorts.py my_project.json --font /System/Library/Fonts/AppleSDGothicNeo.ttc
    python3 scripts/render_shorts.py my_project.json --voice none --no-bgm

필요한 것
    - FFmpeg (libx264, libass 포함 빌드):  맥 `brew install ffmpeg`, 윈도우 `winget install ffmpeg`
    - 한글 폰트: 맥/윈도우 기본 폰트를 자동으로 찾습니다. 없으면 --font로 지정하세요.

음성에 대해
    컷에 녹음/오디오 파일이 있으면 그 소리가 그대로 들어갑니다.
    없을 때 --voice auto(기본)는 espeak-ng가 설치돼 있으면 나레이션을 합성하고,
    없으면 무음으로 둡니다(자막·BGM만 있는 영상).
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
    "sunset": ("#ff6b6b", "#7c3aed"),
    "night": ("#0f172a", "#334155"),
    "mint": ("#06b6d4", "#065f46"),
    "candy": ("#f472b6", "#8b5cf6"),
    "mono": ("#111827", "#4b5563"),
}

BGM_MOODS = {
    "calm": dict(bpm=68, chords=[[0, 3, 7], [-2, 3, 5], [-4, 0, 3], [-5, -1, 2]],
                 pad=0.20, arp=True, kick=False, bright=0.35),
    "upbeat": dict(bpm=118, chords=[[0, 4, 7], [5, 9, 12], [7, 11, 14], [3, 7, 10]],
                   pad=0.16, arp=True, kick=True, bright=0.8),
    "playful": dict(bpm=104, chords=[[0, 4, 7], [2, 5, 9], [4, 7, 11], [0, 5, 7]],
                    pad=0.15, arp=True, kick=True, bright=0.7),
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
    "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf",
    "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Bold.otf",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    "/usr/share/fonts/truetype/unfonts-core/UnDotum.ttf",
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
    ("notosanscjkkr", "Noto Sans CJK KR"),
    ("notosanscjk", "Noto Sans CJK KR"),
    ("notoserifcjkkr", "Noto Serif CJK KR"),
    ("undotum", "UnDotum"),
]

SR = 22050  # BGM 합성 샘플레이트 (가볍게)


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
    return text.replace("*", "")


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
        if ty < 0.42:
            alpha = 0.52 * (1.0 - ty / 0.42) ** 1.2
        elif ty > 0.55:
            alpha = 0.66 * ((ty - 0.55) / 0.45) ** 1.3
        else:
            alpha = 0.0
        a = int(min(255, alpha * 255))
        rows.append(bytes([0] + [0, 0, 0, a] * width))
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

        if config["arp"]:
            for e in range(8):
                note = chord[e % len(chord)] + 12
                freq = base * (2 ** (note / 12))
                _add_tone(buf, start + int(e * beat / 2 * sr), int(0.22 * sr), freq,
                          gain=0.075 * (1.0 - 0.04 * e), attack=0.006, release=0.16, sr=sr)

    # 간단한 저역 통과로 부드럽게
    alpha = 0.25 + 0.5 * config["bright"]
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
        for query in ("Noto Sans CJK KR", "NanumGothic", "sans-serif:lang=ko"):
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
        }
        canvas = {}
        project = raw

    subtitle = style.get("subtitle") or {}
    headline = style.get("headline") or {}
    voice = style.get("voice") or {}
    bgm = style.get("bgm") or {}

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
            "image": cut.get("image") or None,
            "audio": cut.get("audio") or None,
        })

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
        "voice": {
            "name": voice.get("name") or "",
            "lang": voice.get("lang") or "ko-KR",
            "rate": float(voice.get("rate") or 1.0),
            "pitch": float(voice.get("pitch") or 1.0),
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


# ---------------------------------------------------------------------------
# ASS 자막
# ---------------------------------------------------------------------------
def ass_escape(text: str) -> str:
    text = text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")
    return text.replace("\r", "").replace("\n", "\\N")


def highlight_to_ass(text: str, highlight: str, base: str) -> str:
    pieces = []
    for part in re.split(r"(\*[^*]+\*)", text):
        if not part:
            continue
        if part.startswith("*") and part.endswith("*") and len(part) > 2:
            pieces.append(f"{{\\c{ass_color(highlight)}}}{ass_escape(part[1:-1])}{{\\c{ass_color(base)}}}")
        else:
            pieces.append(ass_escape(part))
    return "".join(pieces)


def build_ass(project: dict, font_family: str, path: Path) -> None:
    width = project["width"]
    height = project["height"]
    sub = project["subtitle"]
    head = project["headline_style"]

    align = {"top": 8, "middle": 5, "bottom": 2}.get(sub["position"], 2)
    margin_v = {"top": int(height * 0.255), "middle": 0, "bottom": int(height * 0.135)}[sub["position"]]

    outline_main = max(0.0, sub["outline"]) * 1.6
    head_outline = 3.2

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
        f"Style: Head,{font_family},{head['sizePx']:.0f},{ass_color('#ffffff')},{ass_color('#ffffff')},"
        f"&H00000000,&H64000000,-1,0,0,0,100,100,1,0,1,{head_outline:.1f},2.5,8,54,54,{int(height * 0.085)},1",
        f"Style: Sub,{font_family},{sub['sizePx']:.0f},{ass_color(sub['color'])},{ass_color(sub['color'])},"
        f"&H00000000,&H80000000,-1,0,0,0,100,100,0.5,0,1,{outline_main:.1f},2.0,{align},54,54,{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    clock = 0.0
    for cut in project["cuts"]:
        start = clock
        end = clock + cut["duration"]
        clock = end

        if head["enabled"] and cut["headline"].strip():
            lines.append(
                f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Head,,0,0,0,,"
                f"{{\\fad(180,180)}}{ass_escape(cut['headline'].strip())}"
            )

        sub_text = cut["subtitle"].strip() or cut["narration"].strip()
        if sub_text:
            inner = highlight_to_ass(sub_text, sub["highlight"], sub["color"])
            lines.append(
                f"Dialogue: 1,{ass_time(start + 0.10)},{ass_time(max(start + 0.2, end - 0.10))},Sub,,0,0,0,,"
                f"{{\\fad(120,120)}}{inner}"
            )

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_srt(project: dict, path: Path) -> None:
    blocks = []
    clock = 0.0
    for index, cut in enumerate(project["cuts"]):
        start = clock
        end = clock + cut["duration"]
        clock = end
        text = strip_marks(cut["subtitle"].strip() or cut["narration"].strip())
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


def has_espeak() -> str | None:
    return shutil.which("espeak-ng") or shutil.which("espeak")


def synth_espeak(espeak: str, text: str, out_wav: Path, rate: float, pitch: float) -> bool:
    speed = max(80, min(320, int(160 * rate)))
    pitch_value = max(0, min(99, int(50 * pitch)))
    try:
        subprocess.run([espeak, "-v", "ko", "-s", str(speed), "-p", str(pitch_value), "-w", str(out_wav), text],
                       capture_output=True, text=True, timeout=60)
        return out_wav.exists() and out_wav.stat().st_size > 1000
    except Exception:
        return False


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


def build_segments(project: dict, ffmpeg: str, tmp: Path) -> tuple[list[Path], float, list[str]]:
    width, height, fps = project["width"], project["height"], project["fps"]
    warnings: list[str] = []
    segments: list[Path] = []
    clock = 0.0

    for cut in project["cuts"]:
        frames = max(2, int(round(cut["duration"] * fps)))
        out = tmp / f"seg-{cut['index']:02d}.mp4"

        if cut["image"]:
            image_path = tmp / f"bg-{cut['index']:02d}.img"
            image_path.write_bytes(decode_data_url(cut["image"]["dataUrl"]))
            source_filter = (
                f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}"
            )
        else:
            c_from, c_to = THEMES[cut["theme"]]
            image_path = tmp / f"bg-{cut['index']:02d}.png"
            make_gradient_png(image_path, c_from, c_to)
            source_filter = f"scale={width}:{height}:flags=bicubic,format=yuv420p"
        # 정지 이미지 1장을 넣고 zoompan이 d 프레임을 만들어 내게 합니다.
        input_args = ["-i", str(image_path)]

        rate = 0.16 / max(1, frames)
        if cut["index"] % 2 == 0:
            zoom = f"min(1.02+{rate:.6f}*on,1.20)"
            pan_x = "iw/2-(iw/zoom/2)"
        else:
            zoom = f"max(1.18-{rate:.6f}*on,1.02)"
            pan_x = "iw/2-(iw/zoom/2)"
        pan_y = "ih/2-(ih/zoom/2)"

        if cut["image"]:
            filter_complex = (
                f"[0:v]{source_filter},setsar=1,"
                f"zoompan=z='{zoom}':x='{pan_x}':y='{pan_y}':d={frames}:s={width}x{height}:fps={fps}[v]"
            )
        else:
            filter_complex = (
                f"[0:v]{source_filter},setsar=1,"
                f"zoompan=z='{zoom}':x='{pan_x}':y='{pan_y}':d={frames}:s={width}x{height}:fps={fps}[v]"
            )

        run([
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
            *input_args,
            "-filter_complex", filter_complex,
            "-map", "[v]",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-pix_fmt", "yuv420p", "-r", str(fps), "-g", str(fps * 2),
            "-t", f"{cut['duration']:.3f}",
            str(out),
        ], f"{cut['index'] + 1}번 컷 영상")

        segments.append(out)
        clock += cut["duration"]

    return segments, clock, warnings


def build_audio(project: dict, ffmpeg: str, tmp: Path, voice_mode: str) -> tuple[Path, list[str]]:
    warnings: list[str] = []
    espeak = has_espeak() if voice_mode in ("auto", "espeak") else None
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
            probe = subprocess.run(
                [ffmpeg, "-hide_banner", "-i", str(source), "-f", "null", "-"],
                capture_output=True, text=True,
            )
            match = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", probe.stderr or "")
            if match:
                source_len = int(match.group(1)) * 3600 + int(match.group(2)) * 60 + float(match.group(3))
                if source_len > duration + 0.15:
                    warnings.append(
                        f"{cut['index'] + 1}번 컷 음성이 {source_len:.1f}초인데 컷 길이는 {duration:.1f}초입니다. "
                        f"잘렸습니다 — 컷 길이를 늘리거나 --fit-audio를 쓰세요."
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

        text = (cut["narration"] or strip_marks(cut["subtitle"])).strip()
        if espeak and text and voice_mode != "none":
            spoken = tmp / f"tts-{cut['index']:02d}.wav"
            ok = synth_espeak(espeak, text, spoken, project["voice"]["rate"], project["voice"]["pitch"])
            if ok:
                run([
                    ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                    "-i", str(spoken),
                    "-af", f"apad,atrim=0:{duration:.3f}",
                    "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le",
                    str(out),
                ], f"{cut['index'] + 1}번 컷 TTS")
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
    parser.add_argument("project", help="프로젝트 JSON 경로")
    parser.add_argument("-o", "--output", help="출력 mp4 경로 (기본: 프로젝트 이름.mp4)")
    parser.add_argument("--ffmpeg", help="ffmpeg 실행 파일 경로")
    parser.add_argument("--font", help="한글 폰트 파일 경로")
    parser.add_argument("--font-family", help="ASS에 쓸 폰트 패밀리 이름 (자동 감지 실패 시)")
    parser.add_argument("--voice", choices=["auto", "espeak", "none"], default="auto",
                        help="녹음 파일이 없는 컷의 음성 처리 (기본 auto)")
    parser.add_argument("--no-bgm", action="store_true", help="BGM 없이 렌더")
    parser.add_argument("--crf", type=int, default=20, help="영상 품질 (기본 20, 낮을수록 고화질)")
    parser.add_argument("--preset", default="medium", help="x264 프리셋 (기본 medium)")
    parser.add_argument("--fit-audio", action="store_true",
                        help="녹음이 컷 길이보다 길면 컷 길이를 늘려 잘리지 않게 합니다")
    parser.add_argument("--srt-only", action="store_true", help="자막만 뽑고 끝냅니다")
    parser.add_argument("--keep-temp", action="store_true", help="중간 파일을 남깁니다")
    args = parser.parse_args()

    project_path = Path(args.project).expanduser()
    if not project_path.exists():
        die(f"프로젝트 파일을 찾지 못했습니다: {project_path}")

    try:
        raw = json.loads(project_path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as error:
        die(f"JSON을 읽지 못했습니다: {error}")

    project = normalize(raw)
    output = Path(args.output).expanduser() if args.output else project_path.with_suffix(".mp4")

    tmp = Path(tempfile.mkdtemp(prefix="shortcut-"))
    try:
        srt_path = output.with_suffix(".srt")
        build_srt(project, srt_path)
        log(f"· 자막: {srt_path}")

        if args.srt_only:
            log("SRT만 만들었습니다.")
            return

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
            total = sum(cut["duration"] for cut in project["cuts"])

        ass_path = tmp / "subs.ass"
        build_ass(project, font_family, ass_path)
        scrim_path = tmp / "scrim.png"
        make_scrim_png(scrim_path)

        total = sum(cut["duration"] for cut in project["cuts"])
        log(f"· {len(project['cuts'])}컷 · {total:.1f}초")

        log("[1/4] 컷 영상 만들기")
        segments, _, _ = build_segments(project, ffmpeg, tmp)

        log("[2/4] 컷 영상 연결")
        concat_file = tmp / "video-list.txt"
        concat_file.write_text("".join(f"file '{p.as_posix()}'\n" for p in segments), encoding="utf-8")
        silent_video = tmp / "video.mp4"
        run([
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-c", "copy", str(silent_video),
        ], "영상 연결")

        log("[3/4] 오디오 만들기")
        narration, warnings = build_audio(project, ffmpeg, tmp, args.voice)
        for warning in warnings:
            log(f"  ! {warning}")

        mood = "none" if args.no_bgm else project["bgm"]["mood"]
        mix_inputs = ["-i", str(narration)]
        if mood in BGM_MOODS:
            bgm_path = tmp / "bgm.wav"
            if make_bgm_wav(bgm_path, mood, total, project["bgm"]["volume"]):
                mix_inputs += ["-i", str(bgm_path)]
                fade_out = max(0.1, total - 1.2)
                filter_complex = (
                    f"[1:a]volume=1.0,afade=t=in:st=0:d=1.0,afade=t=out:st={fade_out:.2f}:d=1.2,"
                    f"aformat=sample_rates=44100:channel_layouts=stereo[bg];"
                    f"[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]"
                )
            else:
                filter_complex = "[0:a]anull[a]"
        else:
            filter_complex = "[0:a]anull[a]"

        mixed = tmp / "mix.wav"
        run([
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
            *mix_inputs,
            "-filter_complex", filter_complex,
            "-map", "[a]", "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2",
            str(mixed),
        ], "오디오 믹스")

        log("[4/4] 자막·스크림 합성 및 최종 인코딩")
        output.parent.mkdir(parents=True, exist_ok=True)
        ass_filter = "ass=filename=subs.ass:fontsdir=fonts"

        run([
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(silent_video),
            "-i", str(scrim_path),
            "-i", str(mixed),
            "-filter_complex",
            f"[1:v]scale={project['width']}:{project['height']}[sc];"
            f"[0:v][sc]overlay=0:0,{ass_filter},format=yuv420p[v];"
            f"[2:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]",
            "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-preset", args.preset, "-crf", str(args.crf),
            "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", str(project["fps"]),
            "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
            "-movflags", "+faststart", "-t", f"{total:.3f}",
            str(output),
        ], "최종 인코딩", cwd=tmp)

        size_mb = output.stat().st_size / 1024 / 1024 if output.exists() else 0
        log(f"✅ 완성: {output}  ({size_mb:.1f} MB · {project['width']}×{project['height']} · {total:.1f}초)")
        if not any(cut["audio"] for cut in project["cuts"]) and not has_espeak():
            log("   참고: 녹음이 없고 espeak-ng도 없어 목소리는 들어가지 않았습니다(자막·BGM만).")
    finally:
        if args.keep_temp:
            log(f"· 임시 파일: {tmp}")
        else:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
