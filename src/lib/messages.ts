import type { ServerState } from './ai';

/** 화면에 그대로 나가는 짧은 안내 문구. */
export const NOTE = {
  noKey: 'AI 키 없이 내장 엔진으로 만들었어요. 대본은 그대로 쓰면 됩니다.',
  noServer: '서버 없이 내장 엔진으로 바로 만들었어요.',
  checking: 'AI 연결 확인 중…',
} as const;

export function serverLabel(state: ServerState): string {
  if (state.state === 'checking') return NOTE.checking;
  if (state.state === 'ai') return `AI 대본 연결됨 · ${state.model || state.provider}`;
  return '내장 대본 엔진 사용 중';
}

export function serverDetail(state: ServerState): string {
  if (state.state === 'ai') return '주제에 맞춰 AI가 6컷을 새로 씁니다.';
  if (state.state === 'local' && state.reason === 'no_key') return 'AI 키가 설정되면 서버에서 새 대본을 씁니다. 지금은 내장 엔진이 바로 만듭니다.';
  return '내장 엔진이 바로 만듭니다. 서버를 붙이면 AI 대본으로 바뀝니다.';
}
