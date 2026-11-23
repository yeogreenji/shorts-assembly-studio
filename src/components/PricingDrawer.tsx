import { useEffect, useState } from 'react';
import {
  PLANS,
  activateProDemo,
  cancelProDemo,
  monthlyEquivalent,
  planLabel,
  priceOf,
  setCycle,
  setPlan,
  won,
  type PlanCycle,
  type PlanId,
} from '../lib/plan';
import { Icon } from './Icon';

const COMPARE: { label: string; free: string; pro: string; team: string }[] = [
  { label: '해상도', free: '720p HD', pro: '1080p FHD', team: '1080p FHD' },
  { label: '플랫폼 워터마크', free: '포함', pro: '제거', team: '제거' },
  { label: '보이스', free: '2종', pro: '4종', team: '4종' },
  { label: '드래프트', free: '3개', pro: '무제한', team: '공유 · 무제한' },
  { label: '좌석', free: '1', pro: '1', team: '3' },
];

/**
 * 요금제 — Free / Pro / Team.
 * 결제는 아직 붙이지 않았고, 화면에서 켜는 '무료 체험'이 실제 제한(해상도·워터마크·보이스)을 풉니다.
 */
export function PricingDrawer({ onClose }: { onClose: () => void }) {
  const [cycle, setLocalCycle] = useState<PlanCycle>('monthly');
  const [active, setActive] = useState<PlanId>('free');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const choose = (id: PlanId) => {
    setPlan(id, cycle, id !== 'free');
    setActive(id);
    if (id !== 'free') window.setTimeout(onClose, 420);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="pricing-title" data-testid="pricing">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="요금제 닫기" onClick={onClose} />
      <div className="fade-rise relative my-auto w-full max-w-[1000px] rounded-[14px] border border-line bg-ink-900 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4 sm:px-7 sm:py-5">
          <div>
            <h2 id="pricing-title" className="display text-[18px] font-semibold text-mist-100">
              요금제
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-mist-400">
              지금은 <span className="text-mist-200">결제 연동 전 데모</span>입니다 — 화면과 제한은 실제 상품과 똑같이
              동작하고, 카드 결제는 다음 단계에서 붙습니다.
            </p>
          </div>
          <button
            type="button"
            data-testid="pricing-close"
            onClick={onClose}
            className="btn btn-quiet h-8 w-8 shrink-0"
            aria-label="닫기"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 pt-4 sm:px-7">
          <div className="seg w-[196px]" role="group" aria-label="결제 주기">
            <button type="button" className="seg-item" data-active={cycle === 'monthly'} data-testid="cycle-monthly" onClick={() => { setLocalCycle('monthly'); setCycle('monthly'); }}>
              월간
            </button>
            <button type="button" className="seg-item" data-active={cycle === 'annual'} data-testid="cycle-annual" onClick={() => { setLocalCycle('annual'); setCycle('annual'); }}>
              연간 · 2개월 무료
            </button>
          </div>
          <p className="hidden text-[11px] text-mist-600 sm:block">
            현재 플랜 <span className="text-mist-300">{planLabel({ id: active, cycle, demo: false })}</span>
          </p>
        </div>

        <div className="grid gap-3 px-5 py-4 sm:px-7 lg:grid-cols-3">
          {PLANS.map((def) => {
            const price = priceOf(def, cycle);
            const perMonth = monthlyEquivalent(def, cycle);
            const highlight = def.id === 'pro';
            return (
              <div
                key={def.id}
                data-testid={`plan-option-${def.id}`}
                className={`flex flex-col rounded-[10px] border p-4 ${
                  highlight ? 'border-mist-500/50 bg-ink-800' : 'border-line-soft bg-ink-850'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-mist-100">{def.name}</p>
                  {highlight ? (
                    <span className="rounded border border-mist-500/40 px-1.5 py-[1px] text-[9px] font-semibold tracking-wide text-mist-300">
                      추천
                    </span>
                  ) : def.id === 'team' ? (
                    <span className="rounded border border-mint-500/30 px-1.5 py-[1px] text-[9px] font-semibold tracking-wide text-mint-300">
                      팀
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[11px] text-mist-500">{def.tagline}</p>

                <div className="mt-3 flex items-baseline gap-1">
                  <span className="display text-[24px] font-semibold tracking-tight text-mist-100">
                    {price === 0 ? '0원' : won(price)}
                  </span>
                  <span className="text-[11px] text-mist-500">{cycle === 'annual' ? '/년' : '/월'}</span>
                </div>
                <p className="mt-0.5 h-4 text-[10px] text-mist-600">
                  {cycle === 'annual' && price > 0 ? `월 ${won(perMonth)} 꼴` : price === 0 ? '영구 무료' : '언제든 해지'}
                </p>

                <ul className="mt-3 flex-1 space-y-1.5 border-t border-line-soft pt-3">
                  {def.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-mist-300">
                      <Icon name="check" size={12} className="mt-[3px] shrink-0 text-mint-400" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  data-testid={def.id === 'pro' ? 'pricing-activate-pro' : `pricing-choose-${def.id}`}
                  onClick={() => {
                    if (def.id === 'free') {
                      cancelProDemo();
                      setActive('free');
                      return;
                    }
                    if (def.id === 'pro') {
                      activateProDemo();
                      setActive('pro');
                      onClose();
                      return;
                    }
                    choose('team');
                  }}
                  className={`btn mt-4 h-9 w-full text-[12px] ${highlight ? 'btn-primary' : 'btn-ghost'}`}
                >
                  {def.id === 'free' ? '무료로 쓰기' : def.id === 'pro' ? 'Pro 무료 체험 켜기' : 'Team 14일 체험'}
                </button>
                {def.id !== 'free' ? (
                  <p className="mt-1.5 text-center text-[9px] leading-relaxed text-mist-600">
                    카드 결제는 준비 중 — 지금은 체험으로 전체 기능이 열립니다
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="border-t border-line-soft px-5 py-4 sm:px-7">
          <p className="text-[11px] font-semibold text-mist-300">한눈에 비교</p>
          <div className="mt-2 overflow-hidden rounded-[8px] border border-line-soft">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-ink-800 text-mist-500">
                  <th className="px-3 py-1.5 text-left font-medium">항목</th>
                  <th className="px-3 py-1.5 text-left font-medium">Free</th>
                  <th className="px-3 py-1.5 text-left font-medium">Pro</th>
                  <th className="px-3 py-1.5 text-left font-medium">Team</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.label} className="border-t border-line-soft/70 text-mist-300">
                    <td className="px-3 py-1.5 text-mist-500">{row.label}</td>
                    <td className="px-3 py-1.5">{row.free}</td>
                    <td className="px-3 py-1.5 text-mist-100">{row.pro}</td>
                    <td className="px-3 py-1.5">{row.team}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-mist-600">
            Pro 체험은 이 브라우저에만 저장됩니다. 실제 결제·영수증·팀 초대는 결제 게이트웨이(토스페이먼츠·Stripe)
            연동 단계에서 붙습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
