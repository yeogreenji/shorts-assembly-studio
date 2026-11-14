import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../types';
import { THEME_MAP } from '../lib/presets';
import { cutStartTimes, formatClock, totalDuration } from '../lib/srt';
import { parseHighlight, speak, stopSpeaking } from '../lib/tts';
import { bgmPlayer } from '../lib/bgm';

export function ShortsPlayer({
  project,
  previewAudio,
  onToggleAudio,
}: {
  project: Project;
  previewAudio: boolean;
  onToggleAudio: (next: boolean) => void;
}) {
  const total = useMemo(() => totalDuration(project.cuts), [project.cuts]);
  const starts = useMemo(() => cutStartTimes(project.cuts), [project.cuts]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(280);
  const spokenRef = useRef<number>(-1);

  const activeIndex = useMemo(() => {
    if (project.cuts.length === 0) return 0;
    let index = 0;
    for (let i = 0; i < starts.length; i += 1) {
      if (time >= (starts[i] ?? 0)) index = i;
    }
    return index;
  }, [starts, time, project.cuts.length]);

  const cut = project.cuts[activeIndex];
  const cutStart = starts[activeIndex] ?? 0;
  const cutProgress = cut ? Math.min(1, Math.max(0, (time - cutStart) / cut.duration)) : 0;
  const scale = frameWidth / 1080;

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

  // 컷이 바뀌면 그 컷의 나레이션을 읽어 줍니다 (미리보기 전용)
  useEffect(() => {
    if (!playing || !previewAudio || !cut) return;
    if (spokenRef.current === activeIndex) return;
    spokenRef.current = activeIndex;
    const text = cut.narration.trim() || cut.subtitle.replace(/\*/g, '').trim();
    if (!text) return;
    speak({
      text,
      voiceURI: project.voice.voiceURI,
      rate: project.voice.rate,
      pitch: project.voice.pitch,
      volume: project.voice.volume,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, playing, previewAudio]);

  useEffect(() => {
    if (!playing || !previewAudio || project.bgm.mood === 'none') {
      bgmPlayer.stop();
      return;
    }
    bgmPlayer.start(project.bgm.mood, project.bgm.volume);
    return () => bgmPlayer.stop();
    // 볼륨만 바뀔 때는 아래 이펙트에서 부드럽게 조절합니다 (재시작 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, previewAudio, project.bgm.mood]);

  useEffect(() => {
    bgmPlayer.setVolume(project.bgm.volume);
  }, [project.bgm.volume, playing]);

  useEffect(() => {
    if (!playing) stopSpeaking();
  }, [playing]);

  useEffect(
    () => () => {
      stopSpeaking();
      bgmPlayer.stop();
    },
    [],
  );

  const seekTo = useCallback(
    (seconds: number) => {
      const clamped = Math.min(total, Math.max(0, seconds));
      setTime(clamped);
      spokenRef.current = -1;
      stopSpeaking();
    },
    [total],
  );

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (time >= total - 0.05) setTime(0);
    spokenRef.current = -1;
    setPlaying(true);
  };

  const jumpCut = (direction: -1 | 1) => {
    const target = direction === -1 ? Math.max(0, activeIndex - 1) : Math.min(project.cuts.length - 1, activeIndex + 1);
    seekTo(starts[target] ?? 0);
  };

  const handleScrub = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    seekTo(ratio * total);
  };

  const theme = cut ? THEME_MAP[cut.theme] : THEME_MAP.sunset;
  const highlightStyle = { color: project.subtitle.highlight };
  const outline = Math.max(0, project.subtitle.outline) * Math.max(1, scale * 2.2);
  const shadow = outline
    ? `${outline}px 0 0 #000, -${outline}px 0 0 #000, 0 ${outline}px 0 #000, 0 -${outline}px 0 #000, 0 0 ${outline * 1.6}px rgba(0,0,0,0.65)`
    : '0 2px 12px rgba(0,0,0,0.55)';

  const subtitlePosition = project.subtitle.position;
  const alignment =
    subtitlePosition === 'top'
      ? 'items-start pt-[22%]'
      : subtitlePosition === 'middle'
        ? 'items-center pt-[6%]'
        : 'items-end pb-[16%]';

  return (
    <div>
      <div className="flex justify-center">
        <div
          ref={frameRef}
          onClick={togglePlay}
          className="relative cursor-pointer overflow-hidden rounded-[20px] border border-white/10 bg-black shadow-[0_25px_60px_-25px_rgba(0,0,0,0.95)]"
          style={{ height: 'clamp(300px, 44vh, 500px)', aspectRatio: '9 / 16' }}
        >
          {/* 배경 */}
          {cut?.image ? (
            <img
              key={cut.id}
              src={cut.image.dataUrl}
              alt=""
              className={`absolute inset-0 h-full w-full object-cover ${activeIndex % 2 === 0 ? 'kb-in' : 'kb-out'}`}
              style={{ ['--cut-duration' as string]: `${cut.duration}s` }}
            />
          ) : (
            <div
              key={cut?.id ?? 'empty'}
              className={`absolute inset-0 ${activeIndex % 2 === 0 ? 'kb-in' : 'kb-out'}`}
              style={{
                ['--cut-duration' as string]: `${cut?.duration ?? 4}s`,
                background: `linear-gradient(158deg, ${theme.from} 0%, ${theme.to} 100%)`,
              }}
            />
          )}

          {/* 가독성 스크림 */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/65" />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: cut?.image
                ? 'radial-gradient(circle at 50% 42%, transparent 35%, rgba(0,0,0,0.35) 100%)'
                : 'radial-gradient(circle at 70% 18%, rgba(255,255,255,0.22), transparent 55%)',
            }}
          />

          {/* 헤드라인 */}
          {project.headline.enabled && cut ? (
            <div key={`head-${cut.id}`} className="head-fade absolute inset-x-0 top-[9%] px-[7%]">
              <p
                className="text-center font-black leading-[1.15] tracking-tight text-white"
                style={{
                  fontSize: project.headline.sizePx * scale,
                  textShadow: shadow,
                }}
              >
                {cut.headline}
              </p>
            </div>
          ) : null}

          {/* 컷 표시 */}
          <div className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5">
            <span className="text-[9px] font-bold text-white/80">
              {activeIndex + 1}/{project.cuts.length}
            </span>
          </div>
          <div className="absolute left-2.5 top-2.5 rounded-full bg-black/50 px-2 py-0.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/70">
              {cut?.role === 'hook' ? '훅' : cut?.role === 'cta' ? '투표' : '본문'}
            </span>
          </div>

          {/* 자막 */}
          {cut ? (
            <div className={`absolute inset-0 flex justify-center px-[6%] ${alignment}`}>
              <p
                key={`sub-${cut.id}`}
                className="sub-pop max-w-full rounded-lg bg-black/40 px-3 py-1.5 text-center font-extrabold leading-[1.32] text-white"
                style={{
                  fontSize: project.subtitle.sizePx * scale,
                  color: project.subtitle.color,
                  textShadow: shadow,
                }}
              >
                {parseHighlight(cut.subtitle).map((segment, index) =>
                  segment.highlighted ? (
                    <span key={index} style={highlightStyle}>
                      {segment.text}
                    </span>
                  ) : (
                    <span key={index}>{segment.text}</span>
                  ),
                )}
              </p>
            </div>
          ) : null}

          {/* 정지 표시 */}
          {!playing ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50">
                <span className="ml-0.5 text-xl text-white/90">▶</span>
              </div>
            </div>
          ) : null}

          {/* 진행 바 */}
          <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2">
            <div
              className="group relative h-3 cursor-pointer"
              onClick={(event) => {
                event.stopPropagation();
                handleScrub(event);
              }}
            >
              <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${total ? (time / total) * 100 : 0}%` }}
                />
              </div>
              {starts.map((start, index) =>
                index === 0 ? null : (
                  <span
                    key={index}
                    className="absolute top-1/2 h-2 w-0.5 -translate-y-1/2 bg-white/50"
                    style={{ left: `${(start / (total || 1)) * 100}%` }}
                  />
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 컨트롤 */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => seekTo(0)}
          className="rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-zinc-400 hover:border-white/25 hover:text-white"
          title="처음으로"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={() => jumpCut(-1)}
          className="rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-zinc-400 hover:border-white/25 hover:text-white"
          title="이전 컷"
        >
          ◀ 컷
        </button>
        <button
          type="button"
          onClick={togglePlay}
          className="flex-1 rounded-lg bg-gradient-to-b from-brand-500 to-brand-600 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-brand-600/30 hover:from-brand-400 hover:to-brand-500"
        >
          {playing ? '⏸ 일시정지' : '▶ 미리보기 재생'}
        </button>
        <button
          type="button"
          onClick={() => jumpCut(1)}
          className="rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-zinc-400 hover:border-white/25 hover:text-white"
          title="다음 컷"
        >
          컷 ▶
        </button>
        <button
          type="button"
          onClick={() => onToggleAudio(!previewAudio)}
          title={previewAudio ? '미리보기 소리 끄기' : '미리보기 소리 켜기'}
          className={`rounded-lg border px-2 py-1.5 text-[11px] transition ${
            previewAudio
              ? 'border-brand-400/50 bg-brand-500/15 text-brand-200'
              : 'border-white/10 text-zinc-500 hover:border-white/25'
          }`}
        >
          {previewAudio ? '🔊' : '🔇'}
        </button>
      </div>

      <div className="mt-1.5 flex items-center justify-between px-0.5 text-[10px] text-zinc-500">
        <span className="font-mono">
          {formatClock(time)} / {formatClock(total)}
        </span>
        <span>
          {activeIndex + 1}번째 컷 · {Math.round(cutProgress * 100)}%
        </span>
      </div>
    </div>
  );
}
