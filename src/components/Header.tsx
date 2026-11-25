import type { ServerState } from '../lib/ai';
import { planLabel, type PlanState } from '../lib/plan';
import { Icon, LogoMark } from './Icon';

/** 상단 바 — 스튜디오 이름, 대본 서버 상태, 요금제, 자동 저장. */
export function Header({
  saved,
  plan,
  server,
  onPricing,
}: {
  saved: boolean;
  plan: PlanState;
  server: ServerState;
  onPricing: () => void;
}) {
  const aiReady = server.state === 'ai';
  const planName = planLabel(plan);
  return (
    <header className="sticky top-0 z-40 border-b border-line-soft bg-ink-950/95">
      <div className="mx-auto flex h-14 w-full max-w-[1560px] items-center gap-3 px-3 sm:px-5">
        <LogoMark size={30} />
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-2">
            <p className="display truncate text-[14px] font-semibold tracking-tight text-mist-100">숏컷 스튜디오</p>
            <span className="rounded border border-line px-1.5 py-[1px] text-[9px] font-semibold tracking-[0.06em] text-mist-500">
              v9
            </span>
          </div>
          <p className="hidden text-[10px] tracking-[0.14em] text-mist-600 sm:block">SHORTS ASSEMBLY STUDIO</p>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-1.5 text-[11px] text-mist-500 md:flex">
            <span className={`dot ${aiReady ? 'bg-mint-400' : 'bg-mist-600'}`} aria-hidden="true" />
            {aiReady ? 'AI 대본 연결' : '내장 대본 엔진'}
          </span>

          <span className="hidden items-center gap-1.5 text-[11px] text-mist-500 sm:flex" data-testid="save-state">
            <span className={`dot ${saved ? 'bg-mint-400' : 'bg-amber-400'}`} aria-hidden="true" />
            {saved ? '저장됨' : '저장 중'}
          </span>

          <button
            type="button"
            data-testid="pricing-open"
            onClick={onPricing}
            className={`btn h-8 border px-2.5 text-[11px] ${
              plan.id === 'free'
                ? 'border-line-strong bg-ink-800 text-mist-100 hover:border-mist-500'
                : 'border-mint-500/40 bg-mint-500/10 text-mint-300 hover:bg-mint-500/15'
            }`}
            aria-label="요금제 보기"
          >
            <Icon name="card" size={13} />
            {planName}
            {plan.id === 'free' ? (
              <span className="hidden text-mist-400 sm:inline">· 요금제</span>
            ) : plan.demo ? (
              <span className="hidden text-mint-400/80 sm:inline">체험</span>
            ) : null}
          </button>
        </div>
      </div>
    </header>
  );
}
