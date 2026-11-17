import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Shorts } from '../types';
import { TEMPLATE_MAP, cameraFor, roleLabel } from '../lib/templates';
import { motifsFor } from '../lib/scenes';
import { SceneArt } from './SceneArt';
import { cutStartTimes, formatClock, totalDuration } from '../lib/srt';
import { parseHighlight, stripMarks } from '../lib/text';
import { isTtsSupported, speak, stopSpeaking } from '../lib/tts';

/**
 * 9:16 쇼츠 플레이어.
 * 재생을 누르면 컷이 실제로 넘어가고, 컷이 바뀔 때마다 한국어 음성으로 자막을 읽습니다.
 */
export function ShortsPlayer({
  shorts,
  playNonce,
  seekRequest,
}: {
  shorts: Shorts;
  playNonce: number;
  seekRequest: { index: number; nonce: number } | null;
}) {
  const template = TEMPLATE_MAP[shorts.template];
  const total = useMemo(() => totalDuration(shorts.cuts), [shorts.cuts]);
  const starts = useMemo(() => cutStartTimes(shorts.cuts), [shorts.cuts]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [frameWidth, setFrameWidth] = useState(280);
  const frameRef = useRef<HTMLDivElement>(null);
  const spokenRef = useRef(-1);
  const lastNonce = useRef(playNonce);

  const activeIndex = useMemo(() => {
    let index = 0;
    for (let i = 0; i < starts.length; i += 1) {
      if (time >= (starts[i] ?? 0)) index = i;
    }
    return Math.min(index, Math.max(0, shorts.cuts.length - 1));
  }, [starts, time, shorts.cuts.length]);

  const cut = shorts.cuts[activeIndex] ?? shorts.cuts[0];
  const cutStart = starts[activeIndex] ?? 0;
  const cutProgress = cut ? Math.min(1, Math.max(0, (time - cutStart) / cut.duration)) : 0;
  const scale = frameWidth / 1080;
  const atEnd = time >= total - 0.02;

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setFrameWidth(entry.contentRect.width);
    });
    observer.observe(node);
    setFrameWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      setTime((prev) => {
        const next = prev + delta;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

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

  // 새 쇼츠가 만들어지면 처음부터 자동 재생 (만들기 버튼 클릭 = 사용자 동작이라 소리도 허용됨)
  useEffect(() => {
    if (lastNonce.current === playNonce) return;
    lastNonce.current = playNonce;
    spokenRef.current = -1;
    setTime(0);
    setPlaying(true);
  }, [playNonce]);

  useEffect(() => {
    if (!seekRequest) return;
    spokenRef.current = -1;
    stopSpeaking();
    setTime(starts[seekRequest.index] ?? 0);
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
    if (atEnd) setTime(0);
    spokenRef.current = -1;
    setPlaying(true);
  }, [atEnd, playing]);

  const restart = useCallback(() => {
    spokenRef.current = -1;
    stopSpeaking();
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

  const camera = cameraFor(activeIndex);
  const motifs = useMemo(
    () => motifsFor({ cuts: shorts.cuts, template: shorts.template, seed: shorts.seed, topic: shorts.topic }),
    [shorts.cuts, shorts.template, shorts.seed, shorts.topic],
  );
  const motif = motifs[activeIndex] ?? 'idea';
  const motion = { animationPlayState: playing ? 'running' : ('paused' as const) };
  const stroke = Math.max(1.3, 5.4 * Math.max(0.6, scale * 3.2));

  return (
    <div className="flex w-full flex-col items-center">
      <div
        ref={frameRef}
        data-testid="shorts-frame"
        data-active-index={activeIndex}
        data-playing={playing ? 'true' : 'false'}
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
        {/* 배경 — 컷마다 새로 그려지는 장면 일러스트 */}
        {cut ? (
          <SceneArt
            key={`${cut.id}-${cut.variant ?? 0}-${shorts.seed ?? 0}`}
            seed={shorts.seed ?? 0}
            uid={`${cut.id}v${cut.variant ?? 0}`}
            template={shorts.template}
            motif={motif}
            index={activeIndex}
            className={`cam-${camera} ${playing ? '' : 'scene-paused'}`}
            style={{ ['--cut-duration' as string]: `${cut.duration}s`, ...motion }}
          />
        ) : null}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-black/5 to-black/75" />
        <div className="grain pointer-events-none absolute inset-0 opacity-[0.18]" />
        {cut ? <div key={`flash-${cut.id}`} className="cut-flash pointer-events-none absolute inset-0 bg-white" /> : null}

        {/* 상단: 컷 진행 막대 + 라벨 */}
        <div className="absolute inset-x-0 top-0 z-20" style={{ padding: `${Math.max(8, 26 * scale)}px` }}>
          <div className="flex gap-x-[3px]">
            {shorts.cuts.map((item, index) => (
              <div key={item.id} className="h-[4px] flex-1 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full transition-none"
                  style={{
                    width: index < activeIndex ? '100%' : index === activeIndex ? `${cutProgress * 100}%` : '0%',
                    background: template.palette.accent,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span
              className="truncate rounded-full bg-black/45 px-2 py-[3px] font-bold text-white/90 backdrop-blur"
              style={{ fontSize: Math.max(8, 30 * scale) }}
            >
              {shorts.banner || template.banner}
            </span>
            <span
              className="rounded-full bg-black/45 px-2 py-[3px] font-mono text-white/70 backdrop-blur"
              style={{ fontSize: Math.max(8, 28 * scale) }}
              data-testid="cut-badge"
            >
              {activeIndex + 1}/{shorts.cuts.length}
            </span>
          </div>
        </div>

        {/* 자막 */}
        {cut ? (
          <div
            className="absolute inset-x-0 z-20 flex justify-center px-[7%]"
            style={{ bottom: `${Math.max(26, 148 * scale)}px` }}
          >
            <p
              key={`sub-${cut.id}`}
              data-testid="player-subtitle"
              className="sub-pop text-center font-black"
              style={{
                fontSize: Math.max(15, 84 * scale),
                lineHeight: 1.26,
                letterSpacing: '-0.01em',
                color: '#ffffff',
                WebkitTextStroke: `${stroke}px #000`,
                paintOrder: 'stroke fill',
                textShadow: `${stroke * 0.6}px ${stroke * 0.9}px ${stroke * 1.6}px rgba(0,0,0,0.6)`,
              }}
            >
              {parseHighlight(cut.subtitle).map((segment, index) =>
                segment.highlighted ? (
                  <span key={index} className="hl-pop inline-block" style={{ color: template.palette.accent }}>
                    {segment.text}
                  </span>
                ) : (
                  <span key={index}>{segment.text}</span>
                ),
              )}
            </p>
          </div>
        ) : null}

        {/* 멈춤 / 다시 보기 */}
        {!playing ? (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-black/15">
            <span
              className="flex items-center justify-center rounded-full bg-black/55 text-white shadow-2xl backdrop-blur"
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
        <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
          <span className="font-mono">
            {formatClock(time)} / {formatClock(total)}
          </span>
          <span data-testid="cut-counter">
            {activeIndex + 1}/{shorts.cuts.length}컷 · {roleLabel(activeIndex, shorts.cuts.length)}
          </span>
        </div>
        {!isTtsSupported() ? (
          <p className="mt-2 text-[11px] leading-relaxed text-amber-300/80">
            이 브라우저는 음성 읽기를 지원하지 않아요. 화면 전환과 자막은 그대로 재생됩니다.
          </p>
        ) : (
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
            재생하면 컷마다 자막을 한국어 음성으로 읽어 줍니다. 브라우저 목소리라 설치할 것이 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
