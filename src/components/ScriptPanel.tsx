import { useState } from 'react';
import { TEMPLATES } from '../lib/presets';
import type { Studio } from '../hooks/useStudio';
import { Btn, Chip, Panel, SectionLabel } from './ui';
import { CutCard } from './CutCard';

export function ScriptPanel({ studio }: { studio: Studio }) {
  const { project, patch, updateCut, addCut, duplicateCut, removeCut, moveCut, applyDraft, notify } = studio;
  const [topic, setTopic] = useState(project.topic);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(() => {
    const match = TEMPLATES.find((t) => t.topic === project.topic || t.label === project.title);
    return match?.id ?? null;
  });

  const runDraft = (templateId: string | null) => {
    const template = TEMPLATES.find((t) => t.id === templateId) ?? null;
    setActiveTemplate(template?.id ?? null);
    const text = template ? template.topic : topic;
    if (!template && !text.trim()) {
      notify('주제를 먼저 적어 주세요. 예: "월급 1.5배 매일 야근 vs 칼퇴 월급 동결"', 'warn');
      return;
    }
    if (!template) setTopic(text);
    applyDraft(template, text);
  };

  return (
    <Panel
      step="1"
      title="대본 · 소스 입력"
      hint="주제 한 줄이면 훅 3초 + 본문 + 투표 컷까지 초안이 나옵니다."
      right={
        <span className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-mono text-zinc-400">
          {project.cuts.length}컷
        </span>
      }
    >
      <div className="mb-4 rounded-xl border border-brand-400/20 bg-brand-500/[0.07] p-3">
        <SectionLabel right={<span className="text-[10px] text-brand-300/80">한 줄이면 충분</span>}>
          밸런스 게임 주제
        </SectionLabel>
        <textarea
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          rows={2}
          placeholder="예: 월급 1.5배 매일 야근 vs 칼퇴 월급 동결"
          className="field resize-none text-[13px] leading-snug"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {TEMPLATES.map((template) => (
            <Chip
              key={template.id}
              active={activeTemplate === template.id}
              onClick={() => {
                setTopic(template.topic);
                setActiveTemplate(template.id);
              }}
              title={template.topic}
            >
              {template.emoji} {template.label}
            </Chip>
          ))}
        </div>
        <div className="mt-3 flex gap-1.5">
          <Btn variant="primary" onClick={() => runDraft(activeTemplate)} className="flex-1">
            ✨ 자동 대본 초안 채우기
          </Btn>
          <Btn
            variant="soft"
            onClick={() => runDraft(activeTemplate)}
            title="같은 주제로 다른 훅·문장을 뽑습니다"
          >
            🎲 다시 뽑기
          </Btn>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
          프리셋은 전부 가상의 사무실 상황입니다. 자막에서 <span className="text-brand-300">*별표*</span>로 감싼
          단어가 강조색으로 뜹니다.
        </p>
      </div>

      <SectionLabel right={<span className="text-[10px] text-zinc-600">길게 누르면 이동</span>}>
        컷 {project.cuts.length}개 · 합계 {studio.totalSeconds.toFixed(1)}초
      </SectionLabel>

      <div className="space-y-2">
        {project.cuts.map((cut, index) => (
          <CutCard
            key={cut.id}
            cut={cut}
            index={index}
            total={project.cuts.length}
            voice={project.voice}
            onChange={(changes) => updateCut(cut.id, changes)}
            onMove={(direction) => moveCut(cut.id, direction)}
            onDuplicate={() => duplicateCut(cut.id)}
            onRemove={() => removeCut(cut.id)}
            onNotify={notify}
          />
        ))}
      </div>

      <div className="mt-3 flex gap-1.5">
        <Btn variant="ghost" onClick={() => addCut()} className="flex-1">
          ＋ 컷 추가
        </Btn>
        <Btn variant="ghost" onClick={() => patch({ title: project.title })} title="제목 저장">
          ↻
        </Btn>
      </div>
    </Panel>
  );
}
