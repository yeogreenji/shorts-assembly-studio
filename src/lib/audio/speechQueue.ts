import { isSpeechSupported } from './tts';

/**
 * 브라우저 음성(Web Speech) 발화 큐 — 서버 음성이 없을 때의 미리보기 전용.
 *
 * 예전에는 컷마다 `speechSynthesis.cancel()` 후 짧은 문장 하나씩 읽어,
 * 문장 사이가 뚝뚝 끊기고 앞 문장이 잘렸습니다.
 * 지금은 호흡 블록(2~4컷)을 한 발화로 큐에 차례로 넣기만 하고 중간에 취소하지 않습니다 —
 * 브라우저가 문장을 이어 읽어 억양과 호흡이 살아 있습니다.
 */

export interface SpeechBlock {
  text: string;
  cutIndexes: number[];
}

export interface SpeechOptions {
  /** 속도 배율 */
  rate?: number;
  /** 음높이(0.5~1.6) */
  pitch?: number;
  /** 지금 읽는 블록이 바뀔 때 */
  onBlock?: (blockIndex: number) => void;
  /** 마지막 블록까지 읽었을 때 */
  onDone?: () => void;
}

let queue: SpeechSynthesisUtterance[] = [];
let token = 0;

export function isSpeechQueueSupported(): boolean {
  return isSpeechSupported();
}

/** 블록들을 한 번에 큐에 넣고 이어 읽습니다. 중간 취소 없음. */
export function speakBlocks(blocks: SpeechBlock[], options: SpeechOptions = {}): boolean {
  if (!isSpeechSupported() || !blocks.length) return false;
  const synthesis = window.speechSynthesis;
  // 새로 읽기 시작할 때만 한 번 비웁니다(이전 대기열 정리).
  synthesis.cancel();
  queue = [];
  token += 1;
  const mine = token;

  const voices = synthesis.getVoices();
  const korean =
    voices.find((voice) => voice.lang.toLowerCase().startsWith('ko') && /female|여성|sunhi|yuna|google/i.test(voice.name)) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith('ko')) ??
    null;

  blocks.forEach((block, index) => {
    const clean = block.text.trim();
    if (!clean) return;
    const utterance = new SpeechSynthesisUtterance(clean);
    if (korean) utterance.voice = korean;
    utterance.lang = 'ko-KR';
    utterance.rate = Math.max(0.5, Math.min(2, options.rate ?? 1.04));
    utterance.pitch = Math.max(0.5, Math.min(1.6, options.pitch ?? 1));
    utterance.onstart = () => {
      if (mine === token) options.onBlock?.(index);
    };
    utterance.onerror = (event) => {
      const error = (event as SpeechSynthesisErrorEvent).error ?? '';
      if (error === 'interrupted' || error === 'canceled') return;
    };
    utterance.onend = () => {
      if (mine !== token) return;
      if (index === blocks.length - 1) options.onDone?.();
    };
    queue.push(utterance);
    synthesis.speak(utterance);
  });

  return queue.length > 0;
}

export function stopSpeechQueue(): void {
  token += 1;
  queue = [];
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
}

export function speechQueueSize(): number {
  return queue.length;
}
