import { useSyncExternalStore } from 'react';
import type { VoiceId } from '../types';
import { VOICES } from './audio/tts';

/**
 * 요금제 — Free / Pro / Team.
 *
 * 지금은 결제가 연결되지 않았습니다(데모). 다만 화면·제한은 실제 요금제와 똑같이 동작해서,
 * 결제 게이트웨이를 붙이면 그대로 상품이 됩니다.
 *
 *   Free  월 0원      · 720p · 플랫폼 워터마크 · 보이스 2종 · 드래프트 3개
 *   Pro   월 19,000원 · 1080p FHD · 워터마크 제거 · 보이스 4종 · 드래프트 무제한
 *   Team  월 49,000원 · Pro 전부 + 좌석 3 · 팀 드래프트 · 브랜드 킷
 */

export type PlanId = 'free' | 'pro' | 'team';
export type PlanCycle = 'monthly' | 'annual';

export interface PlanFeature {
  label: string;
  /** 무료에서도 되는 항목 */
  free: boolean;
  pro: boolean;
  team: boolean;
  detail?: string;
}

export interface PlanDef {
  id: PlanId;
  name: string;
  tagline: string;
  monthly: number;
  annual: number;
  accent: 'muted' | 'light' | 'emerald';
  features: string[];
}

export const PLANS: PlanDef[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: '처음 만드는 6컷 · 기능 확인용',
    monthly: 0,
    annual: 0,
    accent: 'muted',
    features: ['720p (HD) 영상 저장', '플랫폼 워터마크 포함', '보이스 2종', '드래프트 3개', '배경음 5종 전체'],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: '매일 올리는 1인 크리에이터',
    monthly: 19_000,
    annual: 190_000,
    accent: 'light',
    features: [
      '1080p FHD 영상 저장',
      '플랫폼 워터마크 제거',
      '보이스 4종 (차분·남성 톤 포함)',
      '드래프트 무제한',
      '브랜드 워터마크 · 로고',
      'MP4(H.264) 저장',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    tagline: '대행사·브랜드 채널 운영',
    monthly: 49_000,
    annual: 490_000,
    accent: 'emerald',
    features: ['Pro 전부 포함', '좌석 3명', '팀 드래프트 공유', '브랜드 킷 (로고·컬러 세트)', '월 100편 저장', '우선 지원'],
  },
];

export interface PlanState {
  id: PlanId;
  cycle: PlanCycle;
  /** 결제 연동 전 데모로 켠 상태 */
  demo: boolean;
}

const KEY = 'shortcut-studio:plan:v1';
const DEFAULT_STATE: PlanState = { id: 'free', cycle: 'monthly', demo: false };

let state: PlanState = read();
const listeners = new Set<() => void>();

function read(): PlanState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<PlanState>;
    const id: PlanId = parsed.id === 'pro' || parsed.id === 'team' ? parsed.id : 'free';
    return {
      id,
      cycle: parsed.cycle === 'annual' ? 'annual' : 'monthly',
      demo: Boolean(parsed.demo),
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function write(next: PlanState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장 공간이 없는 브라우저 — 이번 세션에서만 유지 */
  }
  for (const listener of listeners) listener();
}

export function getPlan(): PlanState {
  return state;
}

export function setPlan(id: PlanId, cycle: PlanCycle = state.cycle, demo = id !== 'free'): void {
  write({ id, cycle, demo });
}

export function setCycle(cycle: PlanCycle): void {
  write({ ...state, cycle });
}

/** 결제 연동 전 — Pro를 7일 체험처럼 켜 둡니다. */
export function activateProDemo(): void {
  write({ id: 'pro', cycle: state.cycle, demo: true });
}

export function cancelProDemo(): void {
  write({ id: 'free', cycle: state.cycle, demo: false });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePlan(): PlanState {
  return useSyncExternalStore(subscribe, getPlan, getPlan);
}

export interface Limits {
  plan: PlanState;
  isPro: boolean;
  isTeam: boolean;
  /** 저장 가능한 가장 큰 세로 해상도 */
  maxHeight: 1280 | 1920;
  /** 플랫폼 워터마크가 영상에 구워지는지 */
  platformMark: boolean;
  /** 쓸 수 있는 보이스 프리셋 */
  voices: VoiceId[];
  draftLimit: number;
  /** MP4(H.264) 저장을 열어 줄지 — 브라우저 지원과 별개로 플랜에서도 막습니다(현재는 전 플랜 허용) */
  mp4: boolean;
}

export function limitsOf(plan: PlanState): Limits {
  const isPro = plan.id === 'pro' || plan.id === 'team';
  const isTeam = plan.id === 'team';
  return {
    plan,
    isPro,
    isTeam,
    maxHeight: isPro ? 1920 : 1280,
    platformMark: !isPro,
    voices: isPro ? VOICES.map((voice) => voice.id) : VOICES.filter((voice) => voice.free).map((voice) => voice.id),
    draftLimit: isTeam ? 200 : isPro ? 24 : 3,
    mp4: true,
  };
}

export function planLabel(plan: PlanState): string {
  const def = PLANS.find((item) => item.id === plan.id) ?? PLANS[0];
  return def ? def.name : 'Free';
}

export function won(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`;
}

export function priceOf(def: PlanDef, cycle: PlanCycle): number {
  return cycle === 'annual' ? def.annual : def.monthly;
}

/** 연간 결제의 월 환산 금액 — 화면에 "월 15,833원"처럼 보여 줍니다. */
export function monthlyEquivalent(def: PlanDef, cycle: PlanCycle): number {
  if (cycle === 'monthly') return def.monthly;
  return Math.round(def.annual / 12);
}
