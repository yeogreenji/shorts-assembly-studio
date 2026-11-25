import type { AudioSettings } from '../../types';
import { previewMix } from './mixer';
import { ensureClip, getClip, narrationSource, speakFallback, voiceOf } from './tts';
import { deliveryOf } from './narration';

/**
 * 한 컷(또는 한 문장)의 음성만 미리 들어보기.
 * 서버 음성이 아직 없으면 그 자리에서 만들고, 서버 자체가 없으면 브라우저 음성으로 대신 읽습니다.
 */
export async function previewVoice(text: string, settings: AudioSettings): Promise<'server' | 'speech' | false> {
  const clean = text.replace(/\*/g, '').trim();
  if (!clean) return false;
  const preset = voiceOf(settings.voice);
  const delivery = deliveryOf(settings.delivery);
  const clip = getClip(clean, settings.voice);
  const ready = clip.status === 'ready' ? clip : await ensureClip(clean, settings.voice);
  if (ready.status === 'ready' && ready.buffer) {
    const running = await previewMix.resume();
    if (!running) return false;
    previewMix.playVoice(ready.buffer, preset, undefined, {
      rate: preset.rate * delivery.rate * settings.voiceRate,
      tone: settings.voiceTone,
      gain: settings.voiceVolume,
      duck: settings.ducking,
      lowShelf: preset.lowShelf,
      lowpass: preset.lowpass,
      warmth: preset.warmth + delivery.warmth,
    });
    return 'server';
  }
  if (narrationSource() === 'speech') {
    speakFallback(clean, {
      rate: preset.rate * delivery.rate * settings.voiceRate * 1.02,
      pitch: delivery.id === 'drama' ? 0.82 : delivery.id === 'friendly' ? 1.1 : delivery.id === 'anchor' ? 1 : 0.94,
    });
    return 'speech';
  }
  return false;
}
