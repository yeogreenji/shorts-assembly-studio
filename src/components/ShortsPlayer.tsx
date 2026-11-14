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
    const target =
      direction === -1 ? Math.max(0, activeIndex - 1) : Math.min(project.cuts.length - 1, activeIndex + 1);
    seekTo(starts[target] ?? 0);
  };

  const handleScrub = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    seekTo(ratio * total);
  };

  const theme = cut ? THEME_MAP[cut.theme] : THEME_MAP.sunset;
  const highlightStyle = { color: project.subtitle.highlight };
  // 쇼츠식 굵은 테두리 — 화면이 밝아도 글자가 살아 있게
  const stroke = Math.max(1.2, project.subtitle.outline * 0.9 * Math.max(0.5, scale * 3));
  const shadow = `${stroke * 0.6}px ${stroke * 0.9}px ${stroke * 1.4}px rgba(0,0,0,0.55)`;

  const subtitlePosition = project.subtitle.position;
  const subtitleStyle =
    subtitlePosition === 'top'
      ? { top: `${((154 + 70) / 1920) * 100}%` }
      : subtitlePosition === 'middle'
        ? { top: '42%', transform: 'translateY(-50%)' }
        : { bottom: `${(0.142 * 1920 * scale).toFixed(1)}px` };

  return (
    <div>
      <div className="flex justify-center">
        <div
          ref={frameRef}
          onClick={togglePlay}
          className="relative cursor-pointer overflow-hidden rounded-[20px] border border-white/10 bg-black shadow-[0_25px_60px_-25px_rgba(0,0,0,0.95)]"
          style={{ height: 'clamp(300px, 46vh, 520px)', aspectRatio: '9 / 16' }}
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
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/60" />

          {/* 컷 전환 플래시 */}
          {cut ? <div key={`flash-${cut.id}`} className="cut-flash pointer-events-none absolute inset-0 bg-white" /> : null}

          {/* 상단 주제 배너 (영상 전체에 고정) */}
          {project.banner.enabled && project.banner.text.trim() ? (
            <div
              className="absolute inset-x-0 top-0 flex items-center justify-center"
              style={{
                height: `${(154 / 1920) * 100}%`,
                background: 'linear-gradient(180deg, rgba(14,14,20,0.92), rgba(10,10,16,0.80))',
                borderBottom: `${Math.max(2, 8 * scale)}px solid ${project.subtitle.highlight}`,
              }}
            >
              <span
                className="font-black tracking-tight"
                style={{
                  color: project.subtitle.highlight,
                  fontSize: 58 * scale,
                  letterSpacing: '0.01em',
                }}
              >
                {project.banner.text}
              </span>
            </div>
          ) : null}

          {/* 헤드라인 */}
          {project.headline.enabled && cut ? (
            <div
              key={`head-${cut.id}`}
              className="head-fade absolute inset-x-0 px-[6%]"
              style={{ top: `${((154 + 34) / 1920) * 100}%` }}
            >
              <p
                className="text-center font-black leading-[1.18] tracking-tight text-white"
                style={{
                  fontSize: project.headline.sizePx * scale,
                  WebkitTextStroke: `${Math.max(1, project.headline.sizePx * scale * 0.075)}px #000`,
                  paintOrder: 'stroke fill',
                  textShadow: shadow,
                }}
              >
                {cut.headline}
              </p>
            </div>
          ) : null}

          {/* 자막 */}
          {cut ? (
            <div className="absolute inset-x-0 flex justify-center px-[5%]" style={subtitleStyle}>
              <p
                key={`sub-${cut.id}`}
                className="sub-pop max-w-full text-center font-extrabold leading-[1.3]"
                style={{
                  fontSize: project.subtitle.sizePx * scale,
                  color: project.subtitle.color,
                  WebkitTextStroke: `${stroke}px #000`,
                  paintOrder: 'stroke fill',
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
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 backdrop-blur">
                <span className="ml-0.5 text-xl text-white/90">▶</span>
              </div>
            </div>
          ) : null}

          {/* 하단 진행바 */}
          <div
            className="group absolute inset-x-0 bottom-0 z-20 cursor-pointer px-0 pb-0"
            onClick={(event) => {
              event.stopPropagation();
              handleScrub(event);
            }}
          >
            <div className="relative h-4 w-full">
              <div
                className="absolute inset-x-0 bottom-0 bg-black/45"
                style={{ height: Math.max(4, 10 * scale) }}
              />
              <div
                className="absolute bottom-0 left-0"
                style={{
                  height: Math.max(4, 10 * scale),
                  width: `${total ? (time / total) * 100 : 0}%`,
                  background: project.subtitle.highlight,
                  boxShadow: `0 0 ${Math.max(4, 10 * scale)}px ${project.subtitle.highlight}66`,
                }}
              />
              {starts.map((start, index) =>
                index === 0 ? null : (
                  <span
                    key={index}
                    className="absolute bottom-0 w-[2px] bg-black/60"
                    style={{ left: `${(start / (total || 1)) * 100}%`, height: Math.max(6, 14 * scale) }}
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

      <p className="mt-1.5 text-center text-[10px] text-zinc-500">
        상단 배너 · 하단 진행바 · 굵은 자막까지 MP4에 똑같이 들어갑니다.
      </p>

      <div className="mt-1 flex items-center justify-between px-0.5 text-[10px] text-zinc-500">
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
