import type { Studio } from '../hooks/useShorts';
import { TEMPLATES, TEMPLATE_MAP, TONES, TONE_LABEL } from '../lib/templates';
import { serverDetail, serverLabel } from '../lib/messages';
import { Icon } from './Icon';

/**
 * 왼쪽 레일 1 — 대본.
 * 주제 한 줄 → 템플릿 → 톤 → 만들기. 이 네 가지만 남기고 나머지는 아래로 내렸습니다.
 */
export function TopicPanel({ studio }: { studio: Studio }) {
  const { topic, setTopic, template, tone, setTone, selectTemplate, generating, generate, server, shorts, totalSeconds } =
    studio;
  const current = TEMPLATE_MAP[template];
  const aiReady = server.state === 'ai';

  return (
    <section className="surface" aria-labelledby="topic-heading">
      <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
        <h2 id="topic-heading" className="flex items-center gap-1.5 text-[12px] font-semibold text-mist-200">
          <Icon name="scissors" size={13} className="text-mist-500" />
          대본
        </h2>
        <span className="text-[10px] text-mist-500">{current.label}</span>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="topic-input" className="text-[11px] font-medium text-mist-300">
              주제
            </label>
            <span className="text-[10px] text-mist-600">{topic.length}/80</span>
          </div>
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
            className="field mt-1.5 resize-none"
            aria-describedby="topic-hint"
          />
          <p id="topic-hint" className="mt-1.5 text-[10px] leading-relaxed text-mist-600">
            Enter로 바로 만들기 · 밸런스는 “A vs B”가 정확합니다
          </p>
        </div>

        <div>
          <p className="text-[11px] font-medium text-mist-300">템플릿</p>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {TEMPLATES.map((item) => {
              const active = item.id === template;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`template-${item.id}`}
                  aria-pressed={active}
                  onClick={() => selectTemplate(item.id)}
                  title={item.topics[0]}
                  className={`rounded-[8px] border px-2 py-1.5 text-left transition ${
                    active
                      ? 'border-mist-500/60 bg-ink-750 text-mist-100'
                      : 'border-line-soft bg-ink-900 text-mist-300 hover:border-line-strong hover:text-mist-100'
                  }`}
                >
                  <span className="block truncate text-[11px] font-semibold">{item.label}</span>
                  <span className="mt-0.5 block truncate text-[9px] text-mist-600">{item.topics[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-medium text-mist-300">톤</p>
            <span className="max-w-[60%] truncate text-[10px] text-mist-600">
              {TONES.find((item) => item.id === tone)?.hint}
            </span>
          </div>
          <div className="seg mt-1.5" role="group" aria-label="톤">
            {TONES.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`tone-${item.id}`}
                aria-pressed={active(tone, item.id)}
                data-active={active(tone, item.id)}
                onClick={() => setTone(item.id)}
                className="seg-item"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          data-testid="generate"
          onClick={() => void generate()}
          disabled={generating}
          className="btn btn-primary h-10 w-full text-[13px] font-semibold"
        >
          {generating ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-mist-600 border-t-ink-950" aria-hidden="true" />
              {aiReady ? 'AI가 6컷 쓰는 중' : '6컷 조립 중'}
            </>
          ) : (
            <>
              <Icon name="sparkles" size={14} />
              6컷 쇼츠 만들기
            </>
          )}
        </button>

        <div className="rounded-[8px] border border-line-soft bg-ink-900 px-2.5 py-2">
          <p className="flex items-center gap-1.5 text-[10px] font-medium text-mist-300" data-testid="server-state">
            <span className={`dot ${aiReady ? 'bg-mint-400' : 'bg-mist-600'}`} aria-hidden="true" />
            {serverLabel(server)}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-mist-600">{serverDetail(server)}</p>
        </div>

        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-mist-600">
          <span className="text-mist-400">{TONE_LABEL[tone]} 톤</span>
          <span aria-hidden="true">·</span>
          <span>{shorts.cuts.length}컷</span>
          <span aria-hidden="true">·</span>
          <span className="mono">{totalSeconds.toFixed(1)}초</span>
        </p>
      </div>
    </section>
  );
}

function active(a: string, b: string): boolean {
  return a === b;
}
