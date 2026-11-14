export interface SpeakRequest {
  text: string;
  voiceURI?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!isTtsSupported()) return [];
  return window.speechSynthesis.getVoices();
}

/** 브라우저는 보이스 목록을 비동기로 채웁니다 (특히 모바일 크롬). */
export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!isTtsSupported()) return Promise.resolve([]);
  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener('voiceschanged', onChange);
      resolve(voices);
    };
    const onChange = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) finish(voices);
    };
    window.speechSynthesis.addEventListener('voiceschanged', onChange);
    window.setTimeout(() => finish(window.speechSynthesis.getVoices()), timeoutMs);
  });
}

export function sortVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...voices].sort((a, b) => {
    const aKo = a.lang.toLowerCase().startsWith('ko') ? 0 : 1;
    const bKo = b.lang.toLowerCase().startsWith('ko') ? 0 : 1;
    if (aKo !== bKo) return aKo - bKo;
    return a.name.localeCompare(b.name);
  });
}

export function speak(req: SpeakRequest): boolean {
  if (!isTtsSupported() || !req.text.trim()) return false;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(req.text);
  const voices = sortVoices(window.speechSynthesis.getVoices());
  const chosen =
    voices.find((v) => v.voiceURI === req.voiceURI) ??
    voices.find((v) => v.lang.toLowerCase().startsWith('ko')) ??
    voices[0];
  if (chosen) {
    utterance.voice = chosen;
    utterance.lang = chosen.lang;
  } else {
    utterance.lang = 'ko-KR';
  }
  utterance.rate = req.rate ?? 1;
  utterance.pitch = req.pitch ?? 1;
  utterance.volume = req.volume ?? 1;

  utterance.onstart = () => req.onStart?.();
  utterance.onend = () => req.onEnd?.();
  utterance.onerror = (event) => {
    if (event.error === 'interrupted' || event.error === 'canceled') {
      req.onEnd?.();
      return;
    }
    req.onError?.(event.error);
  };

  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (!isTtsSupported()) return;
  window.speechSynthesis.cancel();
}

export interface Segment {
  text: string;
  highlighted: boolean;
}

/** '*강조*' 표기를 조각으로 나눕니다. */
export function parseHighlight(input: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /\*([^*]+)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    if (match.index > last) segments.push({ text: input.slice(last, match.index), highlighted: false });
    segments.push({ text: match[1] ?? '', highlighted: true });
    last = match.index + match[0].length;
  }
  if (last < input.length) segments.push({ text: input.slice(last), highlighted: false });
  return segments;
}
