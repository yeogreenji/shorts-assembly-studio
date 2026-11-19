import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Shorts } from '../types';
import { roleLabel } from '../lib/templates';
import { cutStartTimes, formatClock, totalDuration } from '../lib/srt';
import { captionTokens, stripMarks } from '../lib/text';
import { isTtsSupported, speak, stopSpeaking } from '../lib/tts';
import { buildScenePlan } from '../lib/motion/scene';
import { renderFrame } from '../lib/motion/draw';
import { MOTION_LEVELS, type MotionLevel } from '../lib/motion/stage';
import { onArtLoaded, preloadArts } from '../lib/motion/artLoader';

/**
 * 9:16 쇼츠 플레이어.
 * 캔버스 한 장에 그림·카메라 무빙·파티클·컷 전환·자막·HUD를 모두 그립니다.
 * (영상 녹화도 같은 renderFrame을 쓰기 때문에 미리보기와 결과물이 똑같습니다)
 */
export function ShortsPlayer({
  shorts,
  playNonce,
  seekRequest,
  motion,
  onMotion,
}: {
  shorts: Shorts;
  playNonce: number;
  seekRequest: { index: number; nonce: number } | null;
  motion: MotionLevel;
  onMotion: (level: MotionLevel) => void;
}) {
  const total = useMemo(() => totalDuration(shorts.cuts), [shorts.cuts]);
  const starts = useMemo(() => cutStartTimes(shorts.cuts), [shorts.cuts]);
  const plan = useMemo(() => buildScenePlan(shorts), [shorts]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
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
  /** 미리보기 캔버스 해상도 — 기기 성능에 맞춰 자동으로 오르내립니다(녹화는 항상 720). */
  const pixelRef = useRef(576);
  const maxPixelRef = useRef(720);
  const perfRef = useRef({ frames: 0, sum: 0 });

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
      // 미리보기도 영상과 같은 함수·같은 옵션 — 자막·HUD까지 캔버스에 굽습니다.
      renderFrame(canvas, plan, stamp, { captions: true, hud: true, motion });
    },
    [plan, motion],
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
    void preloadArts(plan.cuts.map((cut) => cut.art.id));
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
      renderFrame(canvas, plan, clamped, { captions: true, hud: true, motion: level ?? motion });
      return { at: clamped };
    };
    return () => {
      delete window.__shortcutRenderAt;
    };
  }, [plan, total, motion]);

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
      // 15프레임마다 평균 프레임 시간을 보고 해상도를 한 단계 조절합니다(60fps 지향).
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

  // 컷이 바뀌면 그 컷의 자막을 한국어 음성으로 읽습니다.
  useEffect(() => {
    if (!playing || muted || !cut) return;
    if (spokenRef.current === activeIndex) return;
    spokenRef.current = activeIndex;
    speak({ text: stripMarks(cut.subtitle) });
    // 자막을 고쳐도 재생 중에는 다시 읽지 않습니다(다음 컷부터 반영).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, playing, muted]);

  useEffect(() => {
    if (!playing) stopSpeaking();
  }, [playing]);

  useEffect(() => () => stopSpeaking(), []);

  // 영상 녹화가 시작되면 미리보기는 잠시 멈춥니다 — 같은 캔버스를 두 번 그리지 않게.
  useEffect(() => {
    const onExport = () => {
      setPlaying(false);
      stopSpeaking();
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
  }, [playNonce]);

  useEffect(() => {
    if (!seekRequest) return;
    spokenRef.current = -1;
    stopSpeaking();
    const next = starts[seekRequest.index] ?? 0;
    timeRef.current = next;
    setTime(next);
    setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest]);

  const toggle = useCallback(() => {
    if (playing) {
      spokenRef.current = -1;
      setPlaying(false);
      stopSpeaking();
      return;
    }
    if (atEnd) {
      timeRef.current = 0;
      setTime(0);
    }
    spokenRef.current = -1;
    setPlaying(true);
  }, [atEnd, playing]);

  const restart = useCallback(() => {
    spokenRef.current = -1;
    stopSpeaking();
    timeRef.current = 0;
    setTime(0);
    setPlaying(true);
  }, []);

  const toggleSound = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (next) {
        stopSpeaking();
        spokenRef.current = -1;
      } else {
        spokenRef.current = -1;
      }
      return next;
    });
  }, []);

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
        className="relative shrink-0 cursor-pointer select-none overflow-hidden rounded-[26px] border border-white/12 bg-black shadow-[0_30px_80px_-30px_rgba(0,0,0,0.95)]"
        style={{ height: 'min(62vh, 560px)', aspectRatio: '9 / 16' }}
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

        {/* 멈춤 / 다시 보기 */}
        {!playing ? (
          <div className="pause-overlay absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-black/15">
            <span
              className="flex items-center justify-center rounded-full bg-black/60 text-white shadow-2xl"
              style={{ width: Math.max(44, 132 * scale), height: Math.max(44, 132 * scale), fontSize: Math.max(16, 52 * scale) }}
            >
              {atEnd ? '↻' : '▶'}
            </span>
            <span className="text-[10px] font-semibold tracking-wide text-white/70">
              {atEnd ? '다시 보기' : '눌러서 재생'}
            </span>
          </div>
        ) : null}
      </div>

      {/* 컨트롤 */}
      <div className="mt-4 w-full max-w-[360px]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="play-toggle"
            onClick={toggle}
            aria-pressed={playing}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-brand-400 to-brand-600 px-3 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-600/25 transition hover:from-brand-400 hover:to-brand-500 active:scale-[0.99]"
          >
            {playing ? '⏸ 멈춤' : atEnd ? '↻ 다시 보기' : '▶ 재생'}
          </button>
          <button
            type="button"
            data-testid="restart"
            onClick={restart}
            title="처음부터"
            aria-label="처음부터"
            className="rounded-xl border border-white/10 px-3 py-2.5 text-sm text-zinc-300 transition hover:border-white/25 hover:text-white"
          >
            ↺
          </button>
          <button
            type="button"
            data-testid="sound-toggle"
            onClick={toggleSound}
            aria-pressed={!muted}
            title={muted ? '소리 켜기' : '소리 끄기'}
            aria-label={muted ? '소리 켜기' : '소리 끄기'}
            className={`rounded-xl border px-3 py-2.5 text-sm transition ${
              muted
                ? 'border-white/10 text-zinc-500 hover:border-white/25 hover:text-zinc-300'
                : 'border-brand-400/50 bg-brand-500/15 text-brand-200'
            }`}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>

        {/* 모션 강도 — 같은 6컷도 얼마나 격하게 움직일지 바로 바꿔 볼 수 있습니다 */}
        <div className="mt-2 flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/25 p-1">
          <span className="px-1.5 text-[10px] font-bold text-zinc-400">모션</span>
          {MOTION_LEVELS.map((level) => (
            <button
              key={level.id}
              type="button"
              data-testid={`motion-${level.id}`}
              onClick={() => onMotion(level.id)}
              aria-pressed={motion === level.id}
              title={level.hint}
              className={`flex-1 rounded-lg px-1.5 py-1.5 text-[11px] font-bold transition ${
                motion === level.id
                  ? 'bg-brand-500/25 text-brand-100 shadow-[inset_0_0_0_1px_rgba(255,168,210,0.4)]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {level.id === 'calm' ? '🐢 ' : level.id === 'vivid' ? '⚡ ' : '🔥 '}
              {level.label}
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
          <span className="font-mono">
            {formatClock(time)} / {formatClock(total)}
          </span>
          <span data-testid="cut-counter">
            {activeIndex + 1}/{shorts.cuts.length}컷 · {roleLabel(activeIndex, shorts.cuts.length)}
          </span>
        </div>
        {scene ? (
          <p className="mt-1.5 truncate text-[10px] text-zinc-600" data-testid="scene-label" title={scene.label}>
            🖼 {scene.label}
          </p>
        ) : null}
        {!isTtsSupported() ? (
          <p className="mt-2 text-[11px] leading-relaxed text-amber-300/80">
            이 브라우저는 음성 읽기를 지원하지 않아요. 화면 전환과 자막은 그대로 재생됩니다.
          </p>
        ) : (
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
            자막·배너·게이지까지 캔버스에 구워지므로, 저장한 영상이 지금 보이는 화면과 똑같습니다.
          </p>
        )}
      </div>
    </div>
  );
}
