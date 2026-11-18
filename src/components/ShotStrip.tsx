import type { Shorts, Shot } from '../types';
import { TEMPLATE_MAP, roleLabel } from '../lib/templates';

/** 컷 다듬기 — 자막을 그 자리에서 고치고, 순서를 바꿉니다. */
export function ShotStrip({
  shorts,
  onChange,
  onBlur,
  onMove,
  onJump,
}: {
  shorts: Shorts;
  onChange: (id: string, subtitle: string) => void;
  onBlur: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onJump: (index: number) => void;
}) {
  const accent = TEMPLATE_MAP[shorts.template].palette.accent;
  const last = shorts.cuts.length - 1;

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="cuts-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cuts-heading" className="text-[14px] font-black text-white">
          컷 다듬기
        </h2>
        <p className="text-[10px] text-zinc-500">자막을 고치면 위 화면에 바로 반영됩니다 · *단어* 는 강조색</p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {shorts.cuts.map((cut, index) => (
          <ShotCard
            key={cut.id}
            cut={cut}
            index={index}
            total={shorts.cuts.length}
            accent={accent}
            isLast={index === last}
            onChange={onChange}
            onBlur={onBlur}
            onMove={onMove}
            onJump={onJump}
          />
        ))}
      </div>
    </section>
  );
}

function ShotCard({
  cut,
  index,
  total,
  accent,
  isLast,
  onChange,
  onBlur,
  onMove,
  onJump,
}: {
  cut: Shot;
  index: number;
  total: number;
  accent: string;
  isLast: boolean;
  onChange: (id: string, subtitle: string) => void;
  onBlur: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onJump: (index: number) => void;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-2.5" data-testid={`shot-card-${index}`}>
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => onJump(index)}
          data-testid={`shot-jump-${index}`}
          className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] font-bold text-zinc-300 transition hover:bg-white/5 hover:text-white"
          title="이 컷부터 재생"
        >
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px]" style={{ color: accent }}>
            {index + 1}
          </span>
          {roleLabel(index, total)}
        </button>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onMove(cut.id, -1)}
            disabled={index === 0}
            data-testid={`shot-move-left-${index}`}
            aria-label={`${index + 1}번째 컷 앞으로`}
            className="rounded-md border border-white/10 px-1.5 py-0.5 text-[11px] text-zinc-400 transition enabled:hover:border-white/25 enabled:hover:text-white disabled:opacity-25"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => onMove(cut.id, 1)}
            disabled={isLast}
            data-testid={`shot-move-right-${index}`}
            aria-label={`${index + 1}번째 컷 뒤로`}
            className="rounded-md border border-white/10 px-1.5 py-0.5 text-[11px] text-zinc-400 transition enabled:hover:border-white/25 enabled:hover:text-white disabled:opacity-25"
          >
            →
          </button>
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-base leading-none" aria-hidden="true">
          {cut.emoji}
        </span>
        <input
          value={cut.subtitle}
          onChange={(event) => onChange(cut.id, event.target.value)}
          onBlur={() => onBlur(cut.id)}
          aria-label={`${index + 1}번째 컷 자막`}
          data-testid={`shot-subtitle-${index}`}
          placeholder="이 컷에서 할 말 한 줄"
          maxLength={60}
          className="field flex-1 py-1.5 text-[13px]"
        />
      </div>
      <p className="mt-1.5 truncate text-[10px] text-zinc-600" title={cut.visual?.scene}>
        {cut.duration.toFixed(1)}초 · {cut.visual ? `${cut.visual.scene} · ${cut.visual.camera}` : '화면에 크게 뜨는 자막'}
      </p>
    </div>
  );
}
