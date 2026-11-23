import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioSettings, Shorts } from '../types';
import { roleLabel } from '../lib/templates';
import { cutStartTimes, formatClock, totalDuration } from '../lib/srt';
import { captionTokens, stripMarks } from '../lib/text';
import { ensureClip, getClip, narrationSource, speakFallback, stopFallbackSpeech, voiceOf } from '../lib/audio/tts';
import { previewMix } from '../lib/audio/mixer';
import { previewBgm } from '../lib/audio/bgm';
import { buildScenePlan } from '../lib/motion/scene';
import { renderFrame } from '../lib/motion/draw';
import { MOTION_LEVELS, type MotionLevel } from '../lib/motion/stage';
import { onArtLoaded, preloadArts } from '../lib/motion/artLoader';
import { audioOf } from '../lib/defaults';
import { useNarrationTick } from '../hooks/useNarration';
import { Icon } from './Icon';

/**
 * 9:16 스테이지.
 * 캔버스 한 장에 그림·카메라 무빙·파티클·컷 전환·자막·HUD를 모두 그리고,
 * 그 위에 나레이션과 배경음을 한 믹서에서 겹칩니다(저장 영상과 같은 경로).
 */
export function ShortsPlayer({
  shorts,
  playNonce,
  seekRequest,
  motion,
  onMotion,
  onAudio,
  platformMark = false,
}: {
  shorts: Shorts;
  playNonce: number;
  seekRequest: { index: number; nonce: number } | null;
  motion: MotionLevel;
  onMotion: (level: MotionLevel) => void;
  onAudio: (patch: Partial<AudioSettings>) => void;
  platformMark?: boolean;
}) {
  const total = useMemo(() => totalDuration(shorts.cuts), [shorts.cuts]);
  const starts = useMemo(() => cutStartTimes(shorts.cuts), [shorts.cuts]);
  const plan = useMemo(() => buildScenePlan(shorts), [shorts]);
  const audio = audioOf(shorts);
  const voice = audio.voice ?? 'clear';
  const voiceTick = useNarrationTick();
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [safeZone, setSafeZone] = useState(false);
  const [audioNonce, setAudioNonce] = useState(0);
  const [artVersion, setArtVersion] = useState(0);
  const [frameWidth, setFrameWidth] = useState(280);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const spokenRef = useRef(-1);
  const lastNonce = useRef(playNonce);
  const playingRef = useRef(false);
  const rafRef = useRef(0);
  const uiClock = useRef(0);
  /** 마지막으로 그린 시각 — 화면 크기가 바뀌어 다시 그릴 때 같은 프레임을 유지합니다. */
  const lastPaintRef = useRef(0);
  /** 미리보기 캔버스 해상도 — 기기 성능에 맞춰 자동으로 오르내립니다(녹화는 항상 720/1080). */
  const pixelRef = useRef(576);
  const maxPixelRef = useRef(720);
  const perfRef = useRef({ frames: 0, sum: 0 });
  const audioRef = useRef(audio);
  audioRef.current = audio;

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
      // 미리보기도 영상과 같은 함수·같은 옵션 — 자막·HUD·플랫폼 표식까지 캔버스에 굽습니다.
      renderFrame(canvas, plan, stamp, { captions: true, hud: true, motion, platformMark });
    },
    [plan, motion, platformMark],
  );

  // 캔버스 픽셀 크기 — 화면 폭·DPR에 맞추되, 프레임이 무거우면 스스로 낮춥니다.
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

  // 일러스트가 도착하면 그 즉시 다시 그립니다(멈춰 있어도 그림이 나타나게)
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

  // 보고 있는 컷과 다음 컷 그림을 먼저 준비합니다.
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
      // 20프레임마다 평균 프레임 시간을 보고 해상도를 한 단계 조절합니다(60fps 지향).
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

  /**
   * 나레이션 — 컷이 바뀌면 그 컷의 음성을 같은 믹서에 얹습니다.
   * 음성이 아직 준비 중이면 도착하는 순간(voiceTick) 컷 중간부터 맞춰 재생합니다.
   */
  useEffect(() => {
    if (!playing || audioRef.current.muted || !audioRef.current.narration || !cut) return;
    if (spokenRef.current === activeIndex) return;
    const settings = audioRef.current;
    const text = stripMarks(cut.subtitle);
    if (!text) return;
    const clip = getClip(text, voice);
    const preset = voiceOf(voice);
    const offset = Math.max(0, timeRef.current - (starts[activeIndex] ?? 0));

    if (clip.status === 'ready' && clip.buffer) {
      spokenRef.current = activeIndex;
      void previewMix.resume().then(() => {
        if (!playingRef.current) return;
        previewMix.playVoice(clip.buffer as AudioBuffer, preset, undefined, {
          rate: settings.voiceRate,
          gain: settings.voiceVolume,
          offset,
          duck: settings.ducking,
          lowShelf: preset.lowShelf,
          lowpass: preset.lowpass,
        });
      });
      return;
    }
    if (clip.status === 'idle') {
      void ensureClip(text, voice);
      return;
    }
    if (clip.status === 'error' && narrationSource() === 'speech') {
      spokenRef.current = activeIndex;
      speakFallback(text, 1.06 * preset.rate * settings.voiceRate);
    }
  }, [playing, activeIndex, voiceTick, voice, cut, starts]);

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
      stopFallbackSpeech();
      previewMix.stopVoices();
    }
  }, [playing]);

  useEffect(
    () => () => {
      stopFallbackSpeech();
      previewBgm.stop();
    },
    [],
  );

  // 영상 녹화가 시작되면 미리보기는 잠시 멈춥니다 — 같은 캔버스를 두 번 그리지 않게.
  useEffect(() => {
    const onExport = () => {
      setPlaying(false);
      stopFallbackSpeech();
    };
    window.addEventListener('shortcut:export', onExport);
    return () => window.removeEventListener('shortcut:export', onExport);
  }, []);

  // 새 쇼츠가 만들어지면 처음부터 자동 재생 (만들기 버튼 클릭 = 사용자 동작이라 소리도 허용됨)
  useEffect(() => {
    if (lastNonce.current === playNonce) return;
    lastNonce.current = playNonce;
    spokenRef.current = -1;
    timeRef.current = 0;
    setTime(0);
    setPlaying(true);
    setAudioNonce((value) => value + 1);
  }, [playNonce]);

  useEffect(() => {
    if (!seekRequest) return;
    spokenRef.current = -1;
    stopFallbackSpeech();
    previewMix.stopVoices();
    const next = starts[seekRequest.index] ?? 0;
    timeRef.current = next;
    setTime(next);
    setPlaying(true);
    setAudioNonce((value) => value + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest]);

  const toggle = useCallback(() => {
    if (playing) {
      spokenRef.current = -1;
      setPlaying(false);
      stopFallbackSpeech();
      previewMix.stopVoices();
      return;
    }
    if (atEnd) {
      timeRef.current = 0;
      setTime(0);
    }
    spokenRef.current = -1;
    void previewMix.resume();
    setPlaying(true);
    setAudioNonce((value) => value + 1);
  }, [atEnd, playing]);

  const restart = useCallback(() => {
    spokenRef.current = -1;
    stopFallbackSpeech();
    previewMix.stopVoices();
    timeRef.current = 0;
    setTime(0);
    void previewMix.resume();
    setPlaying(true);
    setAudioNonce((value) => value + 1);
  }, []);

  const toggleSound = useCallback(() => {
    onAudio({ muted: !audio.muted });
    if (!audio.muted) {
      stopFallbackSpeech();
      previewMix.stopVoices();
      spokenRef.current = -1;
    }
  }, [audio.muted, onAudio]);

  const voiceReady = narrationSource();

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
        className="stage-shell relative shrink-0 cursor-pointer select-none overflow-hidden rounded-[14px] bg-black shadow-[0_24px_70px_-40px_rgba(0,0,0,0.95)]"
        style={{ height: 'min(58vh, 520px)', aspectRatio: '9 / 16' }}
      >
        {/* 그림 + 카메라 무빙 + 파티클 + 컷 전환 + 자막 + HUD (영상과 같은 렌더러) */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          data-testid="motion-canvas"
          data-scene={scene?.art.genre ?? ''}
          data-art={scene?.art.id ?? ''}
          data-art-title={scene?.art.title ?? ''}
          aria-hidden="true"
        />

        {/* 자막은 캔버스에 구워집니다. 이 요소는 화면 낭독기·검증용 같은 글자입니다. */}
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

        {/* 세이프 존 — 틱톡·릴스·쇼츠 UI에 가리는 영역을 미리 보여 줍니다(영상에는 안 들어감) */}
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

        {/* 재생 상태 표식 — 이모지 없이 아이콘만 */}
        {!playing ? (
          <div className="pause-overlay absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-black/20">
            <span
              className="flex items-center justify-center rounded-full border border-white/15 bg-black/65 text-white backdrop-blur-sm"
              style={{ width: Math.max(44, 128 * scale), height: Math.max(44, 128 * scale) }}
            >
              <Icon name={atEnd ? 'restart' : 'play'} size={Math.max(18, 46 * scale)} />
            </span>
            <span className="text-[10px] font-medium tracking-wide text-white/70">
              {atEnd ? '다시 보기' : '눌러서 재생'}
            </span>
          </div>
        ) : null}

        {/* 재생 중 표식 */}
        {playing ? (
          <div className="pointer-events-none absolute left-2 top-2 z-20 flex items-center gap-1.5 rounded border border-white/15 bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white/90 backdrop-blur-sm">
            <span className="dot dot-live bg-mint-400" aria-hidden="true" />
            재생 중
          </div>
        ) : null}
      </div>

      {/* 트랜스포트 */}
      <div className="mt-3 w-full max-w-[420px]">
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
            <Icon name="mic" size={11} className={audio.narration && voiceReady !== 'none' ? 'text-mint-400' : 'text-mist-600'} />
            {audio.narration ? (voiceReady === 'server' ? 'AI 음성' : voiceReady === 'speech' ? '브라우저 음성' : '음성 대기') : '음성 꺼짐'}
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
