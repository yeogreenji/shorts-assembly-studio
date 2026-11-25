import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioSettings, Shorts } from '../types';
import { roleLabel } from '../lib/templates';
import { cutStartTimes, formatClock, totalDuration } from '../lib/srt';
import { captionTokens } from '../lib/text';
import { ensureClip, getClip, voiceOf } from '../lib/audio/tts';
import { deliveryOf } from '../lib/audio/narration';
import { speakBlocks, stopSpeechQueue } from '../lib/audio/speechQueue';
import { previewMix } from '../lib/audio/mixer';
import { previewBgm } from '../lib/audio/bgm';
import { buildScenePlan } from '../lib/motion/scene';
import { renderFrame } from '../lib/motion/draw';
import { MOTION_LEVELS, type MotionLevel } from '../lib/motion/stage';
import { onArtLoaded, preloadArts } from '../lib/motion/artLoader';
import { audioOf } from '../lib/defaults';
import type { NarrationView } from '../hooks/useNarration';
import { Icon } from './Icon';
import { Timeline } from './Timeline';

/**
 * 9:16 스테이지.
 * 캔버스 한 장에 그림·카메라 무빙·파티클·컷 전환·자막·HUD를 모두 그리고,
 * 그 위에 나레이션과 배경음을 한 믹서에서 겹칩니다(저장 영상과 같은 경로).
 *
 * 나레이션은 컷마다 끊어 읽지 않고 '호흡 블록'(2~4컷을 이어 붙인 문장)을 한 번에 재생합니다 —
 * 블록이 컷 경계를 넘어 이어지므로 목소리가 뚝뚝 끊기지 않습니다.
 */
export function ShortsPlayer({
  shorts,
  narration,
  playNonce,
  seekRequest,
  motion,
  onMotion,
  onAudio,
  onSeek,
  platformMark = false,
}: {
  shorts: Shorts;
  narration: NarrationView;
  playNonce: number;
  seekRequest: { index: number; nonce: number } | null;
  motion: MotionLevel;
  onMotion: (level: MotionLevel) => void;
  onAudio: (patch: Partial<AudioSettings>) => void;
  onSeek: (index: number) => void;
  platformMark?: boolean;
}) {
  const total = useMemo(() => totalDuration(shorts.cuts), [shorts.cuts]);
  const starts = useMemo(() => cutStartTimes(shorts.cuts), [shorts.cuts]);
  const plan = useMemo(() => buildScenePlan(shorts), [shorts]);
  const audio = audioOf(shorts);
  const voice = audio.voice ?? 'clear';
  const preset = voiceOf(voice);
  const delivery = deliveryOf(audio.delivery);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [safeZone, setSafeZone] = useState(false);
  const [audioNonce, setAudioNonce] = useState(0);
  const [artVersion, setArtVersion] = useState(0);
  const [frameWidth, setFrameWidth] = useState(280);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const lastNonce = useRef(playNonce);
  const playingRef = useRef(false);
  const rafRef = useRef(0);
  const uiClock = useRef(0);
  const lastPaintRef = useRef(0);
  const pixelRef = useRef(576);
  const maxPixelRef = useRef(720);
  const perfRef = useRef({ frames: 0, sum: 0 });
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const narrRef = useRef(narration);
  narrRef.current = narration;
  /** 이번 재생에서 이미 예약한 큐 — 같은 블록을 두 번 예약하지 않게. */
  const scheduledRef = useRef(new Set<string>());
  /** 재생 시작 시각과 오디오 시계의 기준점 — 타임라인 초를 AudioContext 초로 옮길 때 씁니다. */
  const clockRef = useRef({ timeline: 0, audio: 0 });
  const speechKeyRef = useRef('');
  const retriedRef = useRef(new Set<string>());

  const activeIndex = useMemo(() => {
    let index = 0;
    for (let i = 0; i < starts.length; i += 1) {
      if (time >= (starts[i] ?? 0)) index = i;
    }
    return Math.min(index, Math.max(0, shorts.cuts.length - 1));
  }, [starts, time, shorts.cuts.length]);

  const cut = shorts.cuts[activeIndex] ?? shorts.cuts[0];
  const scale = frameWidth / 1080;
  const atEnd = time >= total - 0.02;
  const scene = plan.cuts[activeIndex];

  const paint = useCallback(
    (at?: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const stamp = at ?? timeRef.current;
      lastPaintRef.current = stamp;
      renderFrame(canvas, plan, stamp, { captions: true, hud: true, motion, platformMark });
    },
    [plan, motion, platformMark],
  );

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pixelWidth = Math.max(240, Math.round(pixelRef.current));
    const pixelHeight = Math.round((pixelWidth * 16) / 9);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    paint(lastPaintRef.current);
  }, [paint]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const apply = () => {
      const width = node.clientWidth;
      setFrameWidth(width);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      maxPixelRef.current = Math.min(720, Math.round(width * ratio));
      pixelRef.current = Math.min(pixelRef.current, maxPixelRef.current);
      sizeCanvas();
    };
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    apply();
    return () => observer.disconnect();
  }, [sizeCanvas]);

  useEffect(() => {
    const off = onArtLoaded(() => setArtVersion((value) => value + 1));
    void preloadArts(plan.cuts.map((item) => item.art.id));
    return off;
  }, [plan]);

  useEffect(() => {
    paint();
  }, [paint, artVersion]);

  // 검증용: 시간을 지정해 한 프레임을 그대로 그려 봅니다(픽셀 비교에 씁니다).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    window.__shortcutRenderAt = (at: number, level?: MotionLevel) => {
      const clamped = Math.max(0, Math.min(total, at));
      lastPaintRef.current = clamped;
      renderFrame(canvas, plan, clamped, { captions: true, hud: true, motion: level ?? motion, platformMark });
      return { at: clamped };
    };
    return () => {
      delete window.__shortcutRenderAt;
    };
  }, [plan, total, motion, platformMark]);

  useEffect(() => {
    const ids = [plan.cuts[activeIndex]?.art.id, plan.cuts[activeIndex + 1]?.art.id].filter(
      (id): id is string => Boolean(id),
    );
    if (ids.length) void preloadArts(ids);
  }, [plan, activeIndex]);

  // 재생 루프 — 화면은 매 프레임(최대 60fps) 그리고, UI 숫자는 8fps로만 갱신합니다.
  useEffect(() => {
    playingRef.current = playing;
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    let last = performance.now();
    uiClock.current = 0;
    const tick = (now: number) => {
      if (!playingRef.current) return;
      const delta = Math.min(0.06, (now - last) / 1000);
      last = now;
      const next = Math.min(total, timeRef.current + delta);
      timeRef.current = next;
      paint(next);
      perfRef.current.frames += 1;
      perfRef.current.sum += delta;
      if (perfRef.current.frames >= 20) {
        const average = perfRef.current.sum / perfRef.current.frames;
        perfRef.current.frames = 0;
        perfRef.current.sum = 0;
        const before = pixelRef.current;
        if (average > 0.026 && pixelRef.current > 288) {
          pixelRef.current = Math.max(288, pixelRef.current - 96);
        } else if (average < 0.0135 && pixelRef.current < maxPixelRef.current) {
          pixelRef.current = Math.min(maxPixelRef.current, pixelRef.current + 48);
        }
        if (pixelRef.current !== before) {
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = Math.round(pixelRef.current);
            canvas.height = Math.round((pixelRef.current * 16) / 9);
          }
        }
      }
      uiClock.current += delta;
      if (uiClock.current > 0.12) {
        uiClock.current = 0;
        setTime(next);
      }
      if (next >= total - 0.001) {
        setTime(total);
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, total, paint]);

  /* ── 나레이션 큐 ───────────────────────────────────────── */

  const rate = Math.max(0.6, Math.min(1.6, preset.rate * delivery.rate * audio.voiceRate));

  /** 블록이 실패하면 컷 문장을 낱개로 다시 시도합니다(구글 TTS가 잠깐 막힐 때). */
  useEffect(() => {
    if (!playing || !audio.narration || audio.muted || audio.voiceSource === 'mine') return;
    if (narration.source !== 'server') return;
    for (const block of narration.blocks) {
      const clip = narration.clips[block.index];
      if (!clip || clip.status !== 'error') continue;
      for (const cutIndex of block.cutIndexes) {
        const text = narration.texts[cutIndex];
        if (!text) continue;
        const key = `${voice}|${text}`;
        if (retriedRef.current.has(key)) continue;
        retriedRef.current.add(key);
        void ensureClip(text, voice);
      }
    }
  }, [playing, audio.narration, audio.muted, audio.voiceSource, narration, voice, artVersion]);

  /** 재생·이동·설정이 바뀌면 큐를 비우고 지금 위치부터 다시 겁니다. */
  const resetCues = useCallback(() => {
    scheduledRef.current.clear();
    previewMix.stopVoices();
    clockRef.current = { timeline: timeRef.current, audio: 0 };
  }, []);

  /**
   * 타임라인 시계와 오디오 시계를 새로 맞춥니다.
   * 오디오가 실제로 흐르기 시작한 뒤에 기준점을 잡아야 컷과 음성이 어긋나지 않습니다.
   */
  const anchorClock = useCallback(() => {
    resetCues();
    const timeline = timeRef.current;
    void previewMix.resume().then(() => {
      if (!playingRef.current) return;
      clockRef.current = { timeline, audio: previewMix.now + 0.04 };
      setAudioNonce((value) => value + 1);
    });
  }, [resetCues]);

  useEffect(() => {
    if (!playing) return;
    anchorClock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  /**
   * 아직 예약하지 않은 큐를 지금 위치 기준으로 예약합니다.
   * 준비 중이던 음성이 도착하면(voiceTick) 이 함수가 다시 불려 이어서 붙습니다.
   */
  useEffect(() => {
    if (!playing) return;
    const settings = audioRef.current;
    if (!settings.narration || settings.muted) return;
    // 오디오 기준점이 잡히기 전에는 예약하지 않습니다(재생 시작 직후 한 박자).
    if (!clockRef.current.audio) return;
    const now = timeRef.current;
    const ctxNow = previewMix.now || clockRef.current.audio;
    const anchor = clockRef.current.audio || ctxNow + 0.03;
    const timelineZero = clockRef.current.timeline;

    const cueStart = (start: number) => anchor + (start - timelineZero);

    // 내 목소리 — 컷마다 붙인 녹음/파일
    if (settings.voiceSource === 'mine') {
      shorts.cuts.forEach((item, index) => {
        const take = narration.takes[index];
        if (!take) return;
        const id = `take-${item.id}`;
        if (scheduledRef.current.has(id)) return;
        const start = starts[index] ?? 0;
        if (start + Math.min(item.duration, take.seconds) < now) return;
        scheduledRef.current.add(id);
        const offset = Math.max(0, now - start);
        previewMix.playVoice(take.buffer, preset, cueStart(start), {
          rate: 1,
          tone: 0,
          gain: settings.voiceVolume,
          offset,
          maxSeconds: Math.min(item.duration + 0.25, take.seconds - offset),
          duck: settings.ducking,
          warmth: 0.6,
        });
      });
      return;
    }

    // AI 음성 — 호흡 블록 단위
    narration.blocks.forEach((block) => {
      const blockId = `block-${block.index}`;
      if (scheduledRef.current.has(blockId)) return;
      const first = block.cutIndexes[0] ?? 0;
      const last = block.cutIndexes[block.cutIndexes.length - 1] ?? first;
      const start = starts[first] ?? 0;
      const end = starts[last + 1] ?? total;
      const window = Math.max(0.4, end - start);
      if (start + window < now) return;

      const clip = narration.clips[block.index];
      if (clip?.status === 'ready' && clip.buffer) {
        scheduledRef.current.add(blockId);
        const offset = Math.max(0, now - start);
        previewMix.playVoice(clip.buffer, preset, cueStart(start), {
          rate,
          tone: settings.voiceTone,
          gain: settings.voiceVolume,
          offset,
          maxSeconds: Math.max(0.3, window + 0.3 - offset),
          duck: settings.ducking,
          lowShelf: preset.lowShelf,
          lowpass: preset.lowpass,
          warmth: preset.warmth + delivery.warmth,
        });
        return;
      }

      // 블록 음성이 실패했고 컷 문장은 준비돼 있으면, 컷 단위로 이어 읽습니다.
      if (clip?.status === 'error') {
        block.cutIndexes.forEach((cutIndex, position) => {
          const cutId = `cut-audio-${block.index}-${cutIndex}`;
          if (scheduledRef.current.has(cutId)) return;
          const text = narration.texts[cutIndex];
          const single = text ? getClip(text, voice) : null;
          if (!single || single.status !== 'ready' || !single.buffer) return;
          const cutStart = starts[cutIndex] ?? start + position;
          const cutEnd = starts[cutIndex + 1] ?? end;
          if (cutEnd < now) return;
          scheduledRef.current.add(cutId);
          const offset = Math.max(0, now - cutStart);
          previewMix.playVoice(single.buffer, preset, cueStart(cutStart), {
            rate,
            tone: settings.voiceTone,
            gain: settings.voiceVolume,
            offset,
            maxSeconds: Math.max(0.25, cutEnd - cutStart + 0.2 - offset),
            duck: settings.ducking,
            lowShelf: preset.lowShelf,
            lowpass: preset.lowpass,
            warmth: preset.warmth + delivery.warmth,
          });
        });
      }
    });
    // 블록 텍스트·길이가 바뀌면 다시
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, audioNonce, narration, voice, rate, audio.voiceVolume, audio.ducking, audio.voiceSource, audio.voiceTone, shorts.cuts, starts, total]);

  /**
   * 서버 음성이 없을 때(정적 호스팅) — 브라우저 음성으로 블록을 이어 읽습니다.
   * 컷마다 cancel하지 않고 큐에 차례로 넣기만 해 문장이 끊기지 않습니다.
   */
  useEffect(() => {
    if (!playing || narration.source !== 'speech' || !audio.narration || audio.muted || audio.voiceSource === 'mine') {
      stopSpeechQueue();
      speechKeyRef.current = '';
      return;
    }
    const key = `${narration.blocks.map((block) => block.text).join('|')}|${voice}|${rate}|${delivery.id}`;
    if (speechKeyRef.current === key) return;
    speechKeyRef.current = key;
    if (timeRef.current > 0.3) return; // 중간부터는 브라우저 음성을 새로 걸지 않습니다(처음부터 재생에서만)
    speakBlocks(
      narration.blocks.map((block) => ({ text: block.text, cutIndexes: block.cutIndexes })),
      {
        rate: rate * 1.02,
        pitch: delivery.id === 'drama' ? 0.82 : delivery.id === 'friendly' ? 1.1 : delivery.id === 'anchor' ? 1 : 0.94,
      },
    );
    return () => stopSpeechQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, narration.source, narration.blocks, voice, rate, audio.narration, audio.muted, audio.voiceSource, delivery.id]);

  // 배경음 — 재생 상태·무드·위치가 바뀔 때마다 그 지점부터 다시 맞춥니다.
  useEffect(() => {
    if (!playing || audio.mood === 'off' || audio.muted) {
      previewBgm.stop();
      return;
    }
    void previewBgm.start(timeRef.current, {
      mood: audio.mood,
      volume: audio.volume,
      muted: audio.muted,
      accents: audio.accents,
      total,
      cutStarts: starts,
    });
    return () => previewBgm.stop();
  }, [playing, audio.mood, audio.muted, audio.accents, audioNonce, total, starts]);

  useEffect(() => {
    previewBgm.setVolume(audio.volume);
    previewBgm.setMuted(audio.muted);
  }, [audio.volume, audio.muted]);

  useEffect(() => {
    if (!playing) {
      stopSpeechQueue();
      previewMix.stopVoices();
      scheduledRef.current.clear();
    }
  }, [playing]);

  useEffect(
    () => () => {
      stopSpeechQueue();
      previewBgm.stop();
      previewMix.stopVoices();
    },
    [],
  );

  // 영상 녹화가 시작되면 미리보기는 잠시 멈춥니다 — 같은 캔버스를 두 번 그리지 않게.
  useEffect(() => {
    const onExport = () => {
      setPlaying(false);
      stopSpeechQueue();
    };
    window.addEventListener('shortcut:export', onExport);
    return () => window.removeEventListener('shortcut:export', onExport);
  }, []);

  // 새 쇼츠가 만들어지면 처음부터 자동 재생 (만들기 버튼 클릭 = 사용자 동작이라 소리도 허용됨)
  useEffect(() => {
    if (lastNonce.current === playNonce) return;
    lastNonce.current = playNonce;
    retriedRef.current.clear();
    timeRef.current = 0;
    setTime(0);
    setPlaying(true);
    setAudioNonce((value) => value + 1);
  }, [playNonce]);

  useEffect(() => {
    if (!seekRequest) return;
    stopSpeechQueue();
    previewMix.stopVoices();
    scheduledRef.current.clear();
    const next = starts[seekRequest.index] ?? 0;
    timeRef.current = next;
    setTime(next);
    setPlaying(true);
    resetCues();
    const timeline = next;
    void previewMix.resume().then(() => {
      if (!playingRef.current) return;
      clockRef.current = { timeline, audio: previewMix.now + 0.04 };
      setAudioNonce((value) => value + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest]);

  const toggle = useCallback(() => {
    if (playing) {
      setPlaying(false);
      stopSpeechQueue();
      previewMix.stopVoices();
      scheduledRef.current.clear();
      return;
    }
    if (atEnd) {
      timeRef.current = 0;
      setTime(0);
    }
    scheduledRef.current.clear();
    retriedRef.current.clear();
    void previewMix.resume();
    setPlaying(true);
    anchorClock();
  }, [anchorClock, atEnd, playing]);

  const restart = useCallback(() => {
    stopSpeechQueue();
    previewMix.stopVoices();
    scheduledRef.current.clear();
    timeRef.current = 0;
    setTime(0);
    void previewMix.resume();
    setPlaying(true);
    anchorClock();
  }, [anchorClock]);

  const toggleSound = useCallback(() => {
    onAudio({ muted: !audio.muted });
    if (!audio.muted) {
      stopSpeechQueue();
      previewMix.stopVoices();
      scheduledRef.current.clear();
    }
  }, [audio.muted, onAudio]);

  const voiceReady = narration.source;

  return (
    <div className="flex w-full flex-col items-center">
      <div
        ref={frameRef}
        data-testid="shorts-frame"
        data-active-index={activeIndex}
        data-playing={playing ? 'true' : 'false'}
        data-scene={scene?.art.genre ?? ''}
        data-art={scene?.art.id ?? ''}
        data-art-title={scene?.art.title ?? ''}
        data-art-shot={scene?.art.shot ?? ''}
        data-motion={motion}
        data-audio={audio.mood}
        data-voice={voice}
        data-delivery={audio.delivery}
        data-cuts={shorts.cuts.length}
        data-narration-seconds={(
          narration.clips.reduce((sum, clip) => sum + (clip.seconds || 0), 0) / Math.max(0.5, rate)
        ).toFixed(1)}
        role="button"
        tabIndex={0}
        aria-label={playing ? '쇼츠 미리보기 멈추기' : '쇼츠 미리보기 재생'}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
          }
        }}
        className="stage-shell relative shrink-0 cursor-pointer select-none overflow-hidden rounded-[10px] bg-black shadow-[0_24px_70px_-40px_rgba(0,0,0,0.95)]"
        style={{ height: 'min(52vh, 480px)', aspectRatio: '9 / 16' }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          data-testid="motion-canvas"
          data-scene={scene?.art.genre ?? ''}
          data-art={scene?.art.id ?? ''}
          data-art-title={scene?.art.title ?? ''}
          aria-hidden="true"
        />

        {cut ? (
          <p
            key={`sub-${cut.id}`}
            data-testid="player-subtitle"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-[7%] text-center opacity-0"
            aria-live="polite"
          >
            {captionTokens(cut.subtitle).map((token, index) =>
              token.text === ' ' ? (
                ' '
              ) : (
                <span key={index} className={token.highlighted ? 'hl-pop inline-block' : 'kin-word inline-block'}>
                  {token.text}
                </span>
              ),
            )}
          </p>
        ) : null}

        {safeZone ? (
          <div className="pointer-events-none absolute inset-0 z-20" data-testid="safe-zone">
            <div className="absolute inset-x-0 top-0 h-[11%] border-b border-dashed border-mist-300/60 bg-white/[0.06]">
              <span className="absolute left-2 top-1 text-[9px] font-medium text-mist-100">상단 UI</span>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-[19%] border-t border-dashed border-mist-300/60 bg-white/[0.06]">
              <span className="absolute bottom-1 left-2 text-[9px] font-medium text-mist-100">캡션 영역</span>
            </div>
            <div className="absolute right-0 top-[11%] bottom-[19%] w-[15%] border-l border-dashed border-mist-300/60 bg-white/[0.06]">
              <span className="absolute right-1 top-2 text-[9px] font-medium text-mist-100">버튼</span>
            </div>
            <div className="absolute inset-x-[8%] top-[11%] bottom-[19%] border border-dashed border-white/20" />
          </div>
        ) : null}

        {!playing ? (
          <div className="pause-overlay absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-black/20">
            <span
              className="flex items-center justify-center rounded-full border border-white/15 bg-black/65 text-white backdrop-blur-sm"
              style={{ width: Math.max(44, 128 * scale), height: Math.max(44, 128 * scale) }}
            >
              <Icon name={atEnd ? 'restart' : 'play'} size={Math.max(18, 46 * scale)} />
            </span>
            <span className="text-[10px] font-medium tracking-wide text-white/70">{atEnd ? '다시 보기' : '눌러서 재생'}</span>
          </div>
        ) : null}

        {playing ? (
          <div className="pointer-events-none absolute left-2 top-2 z-20 flex items-center gap-1.5 rounded border border-white/15 bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white/90 backdrop-blur-sm">
            <span className="dot dot-live bg-mint-400" aria-hidden="true" />
            재생 중
          </div>
        ) : null}
      </div>

      {/* 트랜스포트 */}
      <div className="mt-2.5 w-full max-w-[460px]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="play-toggle"
            onClick={toggle}
            aria-pressed={playing}
            className="btn btn-primary h-9 flex-1 text-[12px]"
          >
            <Icon name={playing ? 'pause' : atEnd ? 'restart' : 'play'} size={13} />
            {playing ? '멈춤' : atEnd ? '다시 보기' : '재생'}
          </button>
          <button
            type="button"
            data-testid="restart"
            onClick={restart}
            title="처음부터"
            aria-label="처음부터"
            className="btn btn-ghost h-9 w-9"
          >
            <Icon name="restart" size={14} />
          </button>
          <button
            type="button"
            data-testid="sound-toggle"
            onClick={toggleSound}
            aria-pressed={!audio.muted}
            title={audio.muted ? '소리 켜기' : '소리 끄기'}
            aria-label={audio.muted ? '소리 켜기' : '소리 끄기'}
            className={`btn h-9 w-9 border ${
              audio.muted ? 'border-line bg-ink-800 text-mist-500' : 'border-line-strong bg-ink-750 text-mist-100'
            }`}
          >
            <Icon name={audio.muted ? 'mute' : 'volume'} size={14} />
          </button>
          <button
            type="button"
            data-testid="safe-zone-toggle"
            onClick={() => setSafeZone((value) => !value)}
            aria-pressed={safeZone}
            title="틱톡·릴스·쇼츠 UI에 가리는 영역 보기"
            aria-label="안전 영역 가이드"
            className={`btn h-9 w-9 border ${
              safeZone ? 'border-mint-500/50 bg-mint-500/10 text-mint-300' : 'border-line bg-ink-800 text-mist-400'
            }`}
          >
            <Icon name="crosshair" size={14} />
          </button>
        </div>

        <Timeline
          shorts={shorts}
          total={total}
          time={time}
          activeIndex={activeIndex}
          blocks={narration.blocks}
          onSeekCut={(index) => onSeek(index)}
        />

        <div className="mt-1.5 flex items-center gap-1.5">
          <div className="seg flex-1" role="group" aria-label="모션 강도">
            {MOTION_LEVELS.map((level) => (
              <button
                key={level.id}
                type="button"
                data-testid={`motion-${level.id}`}
                onClick={() => onMotion(level.id)}
                aria-pressed={motion === level.id}
                data-active={motion === level.id}
                title={level.hint}
                className="seg-item"
              >
                {level.label}
              </button>
            ))}
          </div>
          <span className="mono shrink-0 rounded border border-line-soft bg-ink-900 px-1.5 py-1 text-[10px] text-mist-400">
            {formatClock(time)} / {formatClock(total)}
          </span>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-mist-500">
          <span data-testid="cut-counter" className="truncate">
            {activeIndex + 1}/{shorts.cuts.length}컷 · {roleLabel(activeIndex, shorts.cuts.length, shorts.template)}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <Icon
              name="mic"
              size={11}
              className={audio.narration && voiceReady !== 'none' ? 'text-mint-400' : 'text-mist-600'}
            />
            {!audio.narration
              ? '음성 꺼짐'
              : audio.voiceSource === 'mine'
                ? `내 목소리 ${narration.takesCount}컷`
                : voiceReady === 'server'
                  ? `AI 음성 · ${delivery.label}`
                  : voiceReady === 'speech'
                    ? '브라우저 음성'
                    : '음성 대기'}
          </span>
        </div>
        {scene ? (
          <p className="mt-1 truncate text-[10px] text-mist-600" data-testid="scene-label" title={scene.label}>
            {scene.label}
          </p>
        ) : null}
      </div>
    </div>
  );
}
