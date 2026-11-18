import { useMemo } from 'react';
import type { Shorts, Shot } from '../types';
import { TEMPLATE_MAP, roleLabel } from '../lib/templates';
import { buildScenePlan, type CameraMove } from '../lib/motion/scene';
import { artUrl } from '../lib/motion/artLoader';

const MOVE_LABEL: Record<CameraMove, string> = {
  push: '줌인',
  pull: '줌아웃',
  punch: '펀치인',
  drift: '패닝',
  tilt: '틸트',
  shake: '셰이크',
  handheld: '핸드헬드',
  orbit: '회전',
  slide: '슬라이드',
};

/** 컷 다듬기 — 이 컷에 붙은 웹툰 일러스트를 보면서 자막을 고치고, 순서를 바꿉니다. */
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
  const plan = useMemo(() => buildScenePlan(shorts), [shorts]);

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="cuts-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cuts-heading" className="display text-[15px] font-extrabold text-white">
          컷 다듬기
        </h2>
        <p className="text-[11px] text-zinc-500">
          컷마다 붙은 일러스트가 보입니다 · 자막을 고치면 화면에 바로 반영 · <span className="text-zinc-400">*단어*</span>는 강조색
        </p>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {shorts.cuts.map((cut, index) => (
          <ShotCard
            key={cut.id}
            cut={cut}
            index={index}
            total={shorts.cuts.length}
            accent={accent}
            isLast={index === last}
            artId={plan.cuts[index]?.art.id ?? ''}
            artTitle={plan.cuts[index]?.art.title ?? ''}
            artFile={plan.cuts[index]?.art.file ?? ''}
            move={plan.cuts[index]?.camera.move ?? 'push'}
            framing={plan.cuts[index]?.framing ?? 'medium'}
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
  artId,
  artTitle,
  artFile,
  move,
  framing,
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
  artId: string;
  artTitle: string;
  artFile: string;
  move: CameraMove;
  framing: 'close' | 'medium' | 'wide' | 'two-shot';
  onChange: (id: string, subtitle: string) => void;
  onBlur: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onJump: (index: number) => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-2.5 transition hover:border-white/20" data-testid={`shot-card-${index}`}>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => onJump(index)}
          data-testid={`shot-jump-${index}`}
          title={`${index + 1}번 컷 · ${artTitle}부터 재생`}
          className="relative h-[104px] w-[59px] shrink-0 overflow-hidden rounded-lg border border-white/10"
        >
          {artFile ? (
            <img
              src={artUrl(artFile)}
              alt={artTitle}
              data-testid={`shot-art-${index}`}
              data-art={artId}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : null}
          <span
            className="absolute left-1 top-1 rounded bg-black/55 px-1 font-mono text-[9px] font-bold backdrop-blur"
            style={{ color: accent }}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
          <span className="absolute inset-x-0 bottom-0 py-1 text-center text-[9px] font-semibold text-white/90">
            {roleLabel(index, total)}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <p className="min-w-0 flex-1 truncate text-[10px] font-semibold text-zinc-400" title={artTitle}>
              {artTitle || '일러스트 선택 중'}
            </p>
            <div className="flex shrink-0 gap-1">
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
            <span className="text-[13px] leading-none" aria-hidden="true">
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
            {cut.duration.toFixed(1)}초 · {MOVE_LABEL[move]} · {framing === 'two-shot' ? '두 사람' : framing === 'close' ? '클로즈업' : framing === 'wide' ? '와이드' : '인물'}
          </p>
        </div>
      </div>
    </div>
  );
}
