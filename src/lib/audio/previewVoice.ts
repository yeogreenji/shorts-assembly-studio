import type { AudioSettings } from '../../types';
import { previewMix } from './mixer';
import { ensureClip, getClip, narrationSource, speakFallback, voiceOf } from './tts';

/**
 * 한 컷(또는 한 문장)의 음성만 미리 들어보기.
 * 서버 음성이 아직 없으면 그 자리에서 만들고, 서버 자체가 없으면 브라우저 음성으로 대신 읽습니다.
 */
export async function previewVoice(text: string, settings: AudioSettings): Promise<'server' | 'speech' | false> {
  const clean = text.replace(/\*/g, '').trim();
  if (!clean) return false;
  const preset = voiceOf(settings.voice);
  const clip = getClip(clean, settings.voice);
  const ready = clip.status === 'ready' ? clip : await ensureClip(clean, settings.voice);
  if (ready.status === 'ready' && ready.buffer) {
    const running = await previewMix.resume();
    if (!running) return false;
    previewMix.playVoice(ready.buffer, preset, undefined, {
      rate: settings.voiceRate,
      gain: settings.voiceVolume,
      duck: settings.ducking,
      lowShelf: preset.lowShelf,
      lowpass: preset.lowpass,
    });
    return 'server';
  }
  if (narrationSource() === 'speech') {
    speakFallback(clean, 1.06 * preset.rate * settings.voiceRate);
    return 'speech';
  }
  return false;
}
