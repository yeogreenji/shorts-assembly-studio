import { useMemo } from 'react';
import type { Studio } from '../hooks/useShorts';
import { TEMPLATES, TEMPLATE_MAP, TONES, TONE_LABEL } from '../lib/templates';
import { serverDetail, serverLabel } from '../lib/messages';
import { buildScenePlan } from '../lib/motion/scene';
import { artUrl } from '../lib/motion/artLoader';

/**
 * 첫 화면. 주제 한 줄 → 템플릿 한 번 → 톤 하나 → 버튼 하나.
 * 이 네 가지 말고는 아무것도 두지 않았습니다.
 */
export function TopicPanel({ studio }: { studio: Studio }) {
  const { topic, setTopic, template, tone, setTone, selectTemplate, generating, generate, server, shorts, totalSeconds } =
    studio;
  const current = TEMPLATE_MAP[template];
  const aiReady = server.state === 'ai';
  const plan = useMemo(() => buildScenePlan(shorts), [shorts]);
  const previewArts = plan.cuts.slice(0, 6);

  return (
    <section className="panel p-4 sm:p-6" aria-labelledby="topic-heading">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-300/30 bg-brand-500/10 px-2.5 py-1 text-[10px] font-bold tracking-wide text-brand-200">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-300" aria-hidden="true" />
          웹툰 · 로판 아트 엔진
        </span>
        <span className="text-[10px] text-zinc-500">일러스트 {31}장</span>
      </div>

      <h1 id="topic-heading" className="display mt-3 text-[24px] font-black leading-[1.22] text-white sm:text-[29px]">
        예쁜 얼굴의 웹툰 일러스트가
        <br />
        <span className="bg-gradient-to-r from-brand-200 via-brand-300 to-[#b79bff] bg-clip-text text-transparent">
          살아 움직이는 6컷
        </span>
      </h1>
      <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
        로판 드레스부터 오피스 로맨스, 비 오는 밤까지 — 일러스트 자체가 2.5D로 살아 숨 쉬고, 비트마다 카메라가
        밀고 당깁니다. 컷 전환은 플래시·휩 팬·글리치로 휙 넘어갑니다.
      </p>

      {/* 이 스튜디오가 쓰는 아트 미리보기 */}
      <div className="relative mt-3 overflow-hidden rounded-xl border border-white/[0.06] bg-black/30 p-1.5">
        <div className="grid grid-cols-6 gap-1.5">
          {previewArts.map((cut, index) => (
            <div key={`${cut.art.id}-${index}`} className="relative overflow-hidden rounded-md">
              <img
                src={artUrl(cut.art.file)}
                alt={cut.art.title}
                loading="lazy"
                decoding="async"
                className="aspect-[9/16] w-full object-cover opacity-95"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            </div>
          ))}
        </div>
        <p className="mt-1.5 px-1 pb-0.5 text-[10px] text-zinc-500">
          이 대본에 배정된 아트 · 컷마다 다른 얼굴과 장면
        </p>
      </div>

      <label htmlFor="topic-input" className="mt-5 block text-[12px] font-bold text-zinc-200">
        주제
      </label>
      <textarea
        id="topic-input"
        data-testid="topic-input"
        value={topic}
        rows={2}
        maxLength={80}
        onChange={(event) => setTopic(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void generate();
          }
        }}
        placeholder="예: 월급 1.5배 vs 칼퇴"
        className="field mt-1.5 resize-none text-[15px] leading-relaxed"
        aria-describedby="topic-hint"
      />
      <p id="topic-hint" className="mt-1.5 text-[10px] text-zinc-600">
        Enter로 바로 만들기 · 밸런스는 “A vs B”로 쓰면 더 정확합니다
      </p>

      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-[12px] font-bold text-zinc-200">템플릿</span>
        <span className="text-[10px] text-zinc-600">누르면 예시 주제가 채워집니다</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {TEMPLATES.map((item) => {
          const active = item.id === template;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`template-${item.id}`}
              aria-pressed={active}
              onClick={() => selectTemplate(item.id)}
              className={`rounded-xl border px-2.5 py-2 text-left transition ${
                active
                  ? 'border-brand-300/60 bg-brand-500/15 text-brand-100 shadow-[0_10px_30px_-20px_rgba(240,86,159,0.9)]'
                  : 'border-white/10 bg-white/[0.02] text-zinc-300 hover:border-white/25'
              }`}
            >
              <span className="flex items-center gap-1.5 text-[12px] font-bold">
                <span aria-hidden="true">{item.emoji}</span>
                {item.label}
              </span>
              <span className={`mt-0.5 block truncate text-[10px] ${active ? 'text-brand-200/70' : 'text-zinc-500'}`}>
                {item.topics[0]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-[12px] font-bold text-zinc-200">톤</span>
        <span className="text-[10px] text-zinc-600">{TONES.find((item) => item.id === tone)?.hint}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {TONES.map((item) => {
          const active = item.id === tone;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`tone-${item.id}`}
              aria-pressed={active}
              onClick={() => setTone(item.id)}
              className={`rounded-xl border px-2 py-2 text-[12px] font-bold transition ${
                active
                  ? 'border-brand-300/60 bg-brand-500/15 text-brand-100'
                  : 'border-white/10 bg-white/[0.02] text-zinc-300 hover:border-white/25'
              }`}
            >
              <span aria-hidden="true">{item.emoji}</span> {item.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        data-testid="generate"
        onClick={() => void generate()}
        disabled={generating}
        className="btn-primary mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-black text-white transition active:scale-[0.995] disabled:cursor-progress disabled:opacity-70"
      >
        {generating ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
            {aiReady ? 'AI가 6컷 쓰는 중…' : '6컷 조립 중…'}
          </>
        ) : (
          <>🎬 6컷 쇼츠 만들기</>
        )}
      </button>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-white/[0.07] bg-black/30 px-3 py-2">
        <span
          className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${aiReady ? 'bg-emerald-400' : 'bg-zinc-500'}`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-zinc-300" data-testid="server-state">
            {serverLabel(server)}
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">{serverDetail(server)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-zinc-600">
        <span>{current.label}</span>
        <span aria-hidden="true">·</span>
        <span>{TONE_LABEL[tone]} 톤</span>
        <span aria-hidden="true">·</span>
        <span>
          지금 {shorts.cuts.length}컷 {totalSeconds.toFixed(1)}초
        </span>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-zinc-700">
        마지막 컷은 투표 유도 컷입니다. 대본은 브라우저에 자동 저장됩니다.
      </p>
    </section>
  );
}
