import { useState } from 'react';
import type { Studio } from '../hooks/useShorts';
import { PRESETS } from '../lib/presets';
import { Icon } from './Icon';

function when(stamp: number): string {
  const date = new Date(stamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

/** 왼쪽 레일 2 — 상용 프리셋과 드래프트. */
export function ProjectPanel({ studio }: { studio: Studio }) {
  const { shorts, projects, applyPreset, saveDraft, loadDraft, removeDraft } = studio;
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);

  return (
    <section className="surface" aria-labelledby="preset-heading">
      <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
        <h2 id="preset-heading" className="flex items-center gap-1.5 text-[12px] font-semibold text-mist-200">
          <Icon name="grid" size={13} className="text-mist-500" />
          프리셋 · 드래프트
        </h2>
        <span className="text-[10px] text-mist-600">누르면 바로 재생</span>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-1 gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-testid={`preset-${preset.id}`}
              onClick={() => applyPreset(preset.id)}
              className="group flex items-center gap-2.5 rounded-[8px] border border-line-soft bg-ink-900 px-2.5 py-2 text-left transition hover:border-line-strong hover:bg-ink-800"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-semibold text-mist-200 group-hover:text-white">
                  {preset.label}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-mist-600">{preset.tagline}</span>
              </span>
              <span className="shrink-0 rounded border border-line-soft px-1.5 py-[1px] text-[9px] font-medium text-mist-500">
                {preset.goal}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-3 border-t border-line-soft pt-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-mist-300">내 드래프트</p>
            <button
              type="button"
              data-testid="drafts-toggle"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="btn btn-quiet h-6 gap-0.5 px-1.5 text-[10px]"
            >
              {projects.length}개
              <Icon name="chevron" size={11} className={open ? 'rotate-180 transition' : 'transition'} />
            </button>
          </div>

          <div className="mt-2 flex gap-1.5">
            <input
              data-testid="draft-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (saveDraft(name || shorts.title)) setName('');
                }
              }}
              placeholder={shorts.title || '프로젝트 이름'}
              maxLength={40}
              aria-label="드래프트 이름"
              className="field h-8 flex-1 py-1 text-[11px]"
            />
            <button
              type="button"
              data-testid="draft-save"
              onClick={() => {
                if (saveDraft(name || shorts.title)) setName('');
              }}
              className="btn btn-ghost h-8 px-2.5 text-[11px]"
            >
              저장
            </button>
          </div>

          {open ? (
            <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto pr-0.5" data-testid="draft-list">
              {projects.length === 0 ? (
                <li className="rounded-[8px] border border-dashed border-line px-2 py-3 text-center text-[10px] text-mist-600">
                  아직 저장한 드래프트가 없습니다.
                </li>
              ) : (
                projects.map((project) => (
                  <li
                    key={project.id}
                    className="flex items-center gap-1.5 rounded-[8px] border border-line-soft bg-ink-900 px-2 py-1.5"
                    data-testid={`draft-${project.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-mist-200">{project.name}</p>
                      <p className="truncate text-[9px] text-mist-600">
                        {when(project.savedAt)} · {project.template} · {project.seconds.toFixed(1)}초
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadDraft(project.id)}
                      className="btn btn-ghost h-6 shrink-0 px-1.5 text-[10px]"
                    >
                      열기
                    </button>
                    <button
                      type="button"
                      onClick={() => removeDraft(project.id)}
                      aria-label={`${project.name} 지우기`}
                      className="btn btn-quiet h-6 w-6 shrink-0"
                    >
                      <Icon name="close" size={11} />
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
