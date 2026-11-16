import type { Studio } from '../hooks/useShorts';
import { TEMPLATES, TEMPLATE_MAP, TONES, TONE_LABEL } from '../lib/templates';
import { serverDetail, serverLabel } from '../lib/messages';

/**
 * 첫 화면. 주제 한 줄 → 템플릿 한 번 → 톤 하나 → 버튼 하나.
 * 이 네 가지 말고는 아무것도 두지 않았습니다.
 */
export function TopicPanel({ studio }: { studio: Studio }) {
  const { topic, setTopic, template, tone, setTone, selectTemplate, generating, generate, server, shorts, totalSeconds } =
    studio;
  const current = TEMPLATE_MAP[template];
  const aiReady = server.state === 'ai';

  return (
    <section className="panel p-4 sm:p-6" aria-labelledby="topic-heading">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-300/80">주제 한 줄 → 6컷 쇼츠</p>
      <h1 id="topic-heading" className="mt-2 text-[22px] font-black leading-[1.25] tracking-tight text-white sm:text-[26px]">
        한 줄만 적으면,
        <br />
        바로 움직이는 쇼츠가 나옵니다.
      </h1>
      <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
        훅 → 포인트 → 투표까지 6컷을 자동으로 조립하고, 그 자리에서 재생·수정·저장합니다.
      </p>

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
                  ? 'border-brand-400/60 bg-brand-500/15 text-brand-100'
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
                  ? 'border-brand-400/60 bg-brand-500/15 text-brand-100'
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
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand-400 to-brand-600 px-4 py-3.5 text-[15px] font-black text-white shadow-xl shadow-brand-600/30 transition hover:from-brand-400 hover:to-brand-500 active:scale-[0.995] disabled:cursor-progress disabled:opacity-70"
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
        <span>지금 {shorts.cuts.length}컷 {totalSeconds.toFixed(1)}초</span>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-zinc-700">
        마지막 컷은 투표 유도 컷입니다. 대본은 브라우저에 자동 저장됩니다.
      </p>
    </section>
  );
}
