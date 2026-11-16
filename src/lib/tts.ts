/** 브라우저 음성 읽기(Web Speech API) — 설치 없이 바로 한국어 나레이션이 나옵니다. */

export interface SpeakInput {
  text: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined';
}

function koreanVoice(): SpeechSynthesisVoice | null {
  if (!isTtsSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang.toLowerCase().startsWith('ko') && /female|여성|sunhi|yuna|google/i.test(voice.name)) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith('ko')) ??
    null
  );
}

export function speak({ text, rate = 1.12, pitch = 1.04, volume = 1 }: SpeakInput): boolean {
  const clean = text.trim();
  if (!isFiniteSpeech() || !clean) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  const voice = koreanVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = 'ko-KR';
  utterance.rate = rate;
  utterance.pitch = pitch;
  utterance.volume = volume;
  utterance.onerror = (event) => {
    // 컷 전환으로 끊긴 경우는 오류가 아닙니다.
    if (event.error === 'interrupted' || event.error === 'canceled') return;
  };
  window.speechSynthesis.speak(utterance);
  return true;
}

function isFiniteSpeech(): boolean {
  return isTtsSupported();
}

export function stopSpeaking(): void {
  if (!isTtsSupported()) return;
  window.speechSynthesis.cancel();
}
