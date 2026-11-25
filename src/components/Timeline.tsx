import type { NarrationBlock } from '../lib/audio/narration';
import type { Shorts } from '../types';
import { cutStartTimes, formatClock } from '../lib/srt';

/**
 * 타임라인 — 컷 길이에 비례한 클립 바와 재생 헤드.
 * 실제 편집기처럼 "지금 어디를 읽고 있는지"와 "다음 컷이 언제 넘어가는지"를 한눈에 보여 줍니다.
 */
export function Timeline({
  shorts,
  total,
  time,
  activeIndex,
  blocks,
  onSeekCut,
}: {
  shorts: Shorts;
  total: number;
  time: number;
  activeIndex: number;
  blocks: NarrationBlock[];
  onSeekCut: (index: number) => void;
}) {
  const starts = cutStartTimes(shorts.cuts);
  const safeTotal = Math.max(0.1, total);
  const playhead = Math.min(1, Math.max(0, time / safeTotal));
  const blockOf = (cutIndex: number) => blocks.findIndex((block) => block.cutIndexes.includes(cutIndex));
  const spoken = shorts.audio.voiceSource === 'mine' ? null : new Set(blocks.flatMap((block) => block.cutIndexes));

  return (
    <div className="mt-2 select-none" data-testid="timeline">
      <div className="timeline-ruler mb-1 h-[5px] w-full opacity-40" aria-hidden="true" />
      <div className="relative h-[38px] w-full overflow-hidden rounded-[5px] border border-line-soft bg-[#0a0c10]">
        {/* 컷 클립 — 길이에 비례 */}
        <div className="absolute inset-0 flex">
          {shorts.cuts.map((cut, index) => {
            const width = (cut.duration / safeTotal) * 100;
            const active = index === activeIndex;
            const group = spoken ? blockOf(index) : -1;
            return (
              <button
                key={cut.id}
                type="button"
                data-testid={`timeline-cut-${index}`}
                onClick={() => onSeekCut(index)}
                title={`${index + 1}번 컷 · ${cut.duration.toFixed(1)}초`}
                className={`group relative h-full border-r border-[#0a0c10] last:border-r-0 ${
                  active ? 'bg-[#2a3341]' : 'bg-[#171c24] hover:bg-[#1e242e]'
                }`}
                style={{ width: `${width}%` }}
              >
                <span
                  className={`absolute inset-x-[3px] top-[5px] h-[3px] rounded-full ${
                    active ? 'bg-mist-100' : group >= 0 && group % 2 === 0 ? 'bg-mint-500/45' : 'bg-line-strong'
                  }`}
                />
                <span
                  className={`absolute inset-x-[3px] bottom-[5px] truncate text-left text-[8px] leading-[10px] ${
                    active ? 'text-mist-200' : 'text-mist-600'
                  }`}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
              </button>
            );
          })}
        </div>

        {/* 호흡 블록 경계 — 이 지점에서 나레이션이 새로 시작합니다 */}
        {blocks.slice(1).map((block) => {
          const start = starts[block.cutIndexes[0] ?? 0] ?? 0;
          return (
            <span
              key={`breath-${block.index}`}
              className="pointer-events-none absolute top-[2px] bottom-[2px] w-[2px] bg-mint-500/70"
              style={{ left: `${(start / safeTotal) * 100}%` }}
              title={`${block.index + 1}호흡 시작`}
            />
          );
        })}

        {/* 재생 헤드 */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-[1.5px] bg-[#f4f6fa] shadow-[0_0_8px_rgba(244,246,250,0.55)]"
          style={{ left: `calc(${playhead * 100}% - 0.75px)` }}
          data-testid="timeline-playhead"
        />
      </div>

      <div className="mt-1 flex items-center justify-between text-[9px] text-mist-600">
        <span className="mono">
          00:00 <span className="text-mist-500">/ {formatClock(safeTotal)}</span>
        </span>
        <span data-testid="timeline-blocks">
          {shorts.audio.voiceSource === 'mine'
            ? `내 목소리 ${shorts.cuts.length}컷`
            : `나레이션 ${blocks.length}호흡 · ${blocks.reduce((sum, block) => sum + block.cutIndexes.length, 0)}컷`}
        </span>
      </div>
    </div>
  );
}
