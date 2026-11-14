import { useRef, useState } from 'react';
import type { Studio } from '../hooks/useStudio';
import { draftToProject } from '../lib/presets';
import { Btn } from './ui';

export function Header({
  studio,
  onOpenGuide,
}: {
  studio: Studio;
  onOpenGuide: () => void;
}) {
  const { project, patch, loadProject, notify, saveState, totalSeconds } = studio;
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (!parsed || !Array.isArray(parsed.cuts)) {
        throw new Error('이 파일에는 cuts 배열이 없습니다. 스튜디오에서 내보낸 JSON인지 확인해 주세요.');
      }
      const base = draftToProject(null, String(parsed.topic ?? '가져온 프로젝트'));
      const incoming = parsed as unknown as typeof base;
      loadProject({
        ...base,
        ...incoming,
        voice: { ...base.voice, ...(incoming.voice ?? {}) },
        aiVoice: { ...base.aiVoice, ...(incoming.aiVoice ?? {}) },
        subtitle: { ...base.subtitle, ...(incoming.subtitle ?? {}) },
        headline: { ...base.headline, ...(incoming.headline ?? {}) },
        banner: { ...base.banner, ...(incoming.banner ?? {}) },
        bgm: { ...base.bgm, ...(incoming.bgm ?? {}) },
      });
      notify('프로젝트를 불러왔습니다.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'JSON을 읽지 못했습니다.', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveLabel =
    saveState === 'saved'
      ? '자동 저장됨'
      : saveState === 'saving'
        ? '저장 중…'
        : saveState === 'stripped'
          ? '용량 초과 · 텍스트만 저장'
          : '저장 실패';

  return (
    <header className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-600/30">
          <span className="text-[13px]">🎬</span>
        </div>
        <div className="leading-tight">
          <p className="text-[13px] font-bold tracking-tight text-white">숏컷 스튜디오</p>
          <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Shorts Assembly Studio</p>
        </div>
      </div>

      <div className="mx-1 hidden h-7 w-px bg-white/10 sm:block" />

      <div className="min-w-0 flex-1">
        {editingTitle ? (
          <input
            autoFocus
            value={project.title}
            onChange={(event) => patch({ title: event.target.value })}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') setEditingTitle(false);
            }}
            className="field max-w-sm py-1 text-[13px] font-semibold"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingTitle(true)}
            className="max-w-full truncate rounded-md px-1.5 py-1 text-left text-[13px] font-semibold text-zinc-200 hover:bg-white/5"
            title="제목 수정"
          >
            {project.title || '제목 없음'} <span className="text-[10px] text-zinc-600">✎</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[10px] text-zinc-400">
          {totalSeconds.toFixed(1)}초 · {project.cuts.length}컷
        </span>
        <span
          className={`hidden items-center gap-1 text-[10px] sm:flex ${
            saveState === 'failed' || saveState === 'stripped' ? 'text-amber-300' : 'text-zinc-500'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              saveState === 'saving' ? 'bg-amber-400 pulse-dot' : saveState === 'saved' ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
          {saveLabel}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(event) => void handleImport(event.target.files?.[0])}
        />
        <Btn variant="ghost" onClick={() => fileRef.current?.click()} title="JSON 프로젝트 불러오기">
          불러오기
        </Btn>
        <Btn variant="ghost" onClick={onOpenGuide} title="사용법">
          사용법
        </Btn>
      </div>
    </header>
  );
}
