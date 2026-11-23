import type { Studio } from '../hooks/useShorts';
import type { NarrationView } from '../hooks/useNarration';
import { MOOD_LIST, previewMood } from '../lib/audio/bgm';
import { VOICES, clipLabel, type Clip } from '../lib/audio/tts';
import { previewVoice } from '../lib/audio/previewVoice';
import { Icon } from './Icon';

function clipTone(clip: Clip, source: 'server' | 'speech' | 'none'): string {
  if (clip.status === 'ready') return 'text-mint-400';
  if (clip.status === 'loading') return 'text-amber-400';
  if (clip.status === 'error') return source === 'speech' ? 'text-amber-400/80' : 'text-red-400/80';
  return 'text-mist-600';
}

/** 인스펙터 1 — 배경음과 나레이션(TTS). */
export function AudioPanel({
  studio,
  narration,
  onPricing,
}: {
  studio: Studio;
  narration: NarrationView;
  onPricing: () => void;
}) {
  const { shorts, setAudio, notify } = studio;
  const audio = shorts.audio;

  const playAll = async () => {
    if (!audio.narration) {
      notify('나레이션을 먼저 켜 주세요.', 'warn');
      return;
    }
    for (let index = 0; index < narration.texts.length; index += 1) {
      const result = await previewVoice(narration.texts[index] ?? '', audio);
      if (!result) {
        notify('이 컷의 음성을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 'warn');
        return;
      }
    }
  };

  return (
    <div className="space-y-5">
      {/* ── 배경음 ─────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-mist-200">
            <Icon name="music" size={12} className="text-mist-500" />
            배경음
          </h3>
          <button
            type="button"
            data-testid="bgm-preview"
            onClick={() => previewMood(audio)}
            disabled={audio.mood === 'off'}
            className="btn btn-quiet h-6 gap-1 px-1.5 text-[10px] disabled:opacity-40"
          >
            <Icon name="play" size={10} />5초 미리듣기
          </button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {MOOD_LIST.map((mood) => {
            const active = (audio.mood ?? 'off') === mood.id;
            return (
              <button
                key={mood.id}
                type="button"
                data-testid={`bgm-${mood.id}`}
                aria-pressed={active}
                title={mood.hint}
                onClick={() => setAudio({ mood: mood.id })}
                className={`rounded-[7px] border px-1.5 py-1.5 text-[10px] font-medium transition ${
                  active
                    ? 'border-mist-500/60 bg-ink-750 text-mist-100'
                    : 'border-line-soft bg-ink-900 text-mist-400 hover:border-line-strong hover:text-mist-200'
                }`}
              >
                {mood.label}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            data-testid="bgm-mute"
            aria-pressed={!audio.muted}
            onClick={() => setAudio({ muted: !audio.muted })}
            title={audio.muted ? '배경음 켜기' : '배경음 끄기'}
            aria-label={audio.muted ? '배경음 켜기' : '배경음 끄기'}
            className={`btn h-7 w-7 border ${
              audio.muted ? 'border-line bg-ink-900 text-mist-500' : 'border-line-strong bg-ink-750 text-mist-100'
            }`}
          >
            <Icon name={audio.muted ? 'mute' : 'volume'} size={12} />
          </button>
          <input
            type="range"
            data-testid="bgm-volume"
            min={0}
            max={100}
            step={1}
            value={Math.round(audio.volume * 100)}
            onChange={(event) => setAudio({ volume: Number(event.target.value) / 100 })}
            aria-label="배경음 볼륨"
            className="h-1 flex-1"
          />
          <span className="mono w-8 text-right text-[10px] text-mist-500">{Math.round(audio.volume * 100)}%</span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label className="flex items-center gap-1.5 text-[10px] text-mist-400">
            <input
              type="checkbox"
              data-testid="bgm-accents"
              checked={audio.accents}
              onChange={(event) => setAudio({ accents: event.target.checked })}
              className="h-3 w-3"
            />
            컷 전환 효과음
          </label>
          <span className="text-[10px] text-mist-600">
            {audio.mood === 'off' || audio.muted ? '무음으로 저장됩니다' : '영상에 함께 녹음됩니다'}
          </span>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-mist-600">
          배경음은 브라우저가 그 자리에서 합성합니다 — 음원 저작권 걱정 없이 어느 플랫폼에나 올릴 수 있습니다.
        </p>
      </section>

      {/* ── 나레이션 ───────────────────────────── */}
      <section className="border-t border-line-soft pt-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-mist-200">
            <Icon name="mic" size={12} className="text-mist-500" />
            AI 나레이션
          </h3>
          <button
            type="button"
            data-testid="tts-toggle"
            aria-pressed={audio.narration}
            onClick={() => setAudio({ narration: !audio.narration })}
            className={`btn h-6 border px-2 text-[10px] font-semibold ${
              audio.narration
                ? 'border-mint-500/45 bg-mint-500/10 text-mint-300'
                : 'border-line bg-ink-900 text-mist-500'
            }`}
          >
            {audio.narration ? '켜짐' : '꺼짐'}
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {VOICES.map((voice) => {
            const locked = !narration.limits.voices.includes(voice.id);
            const active = narration.voice === voice.id && audio.narration;
            return (
              <button
                key={voice.id}
                type="button"
                data-testid={`voice-${voice.id}`}
                aria-pressed={active}
                data-locked={locked}
                title={locked ? 'Pro에서 열립니다' : voice.hint}
                onClick={() => {
                  if (locked) {
                    notify('이 보이스는 Pro에 있습니다. 무료 체험으로 열 수 있어요.', 'warn');
                    onPricing();
                    return;
                  }
                  setAudio({ voice: voice.id, narration: true });
                }}
                className={`flex items-start gap-1.5 rounded-[7px] border px-2 py-1.5 text-left transition ${
                  active
                    ? 'border-mist-500/60 bg-ink-750'
                    : 'border-line-soft bg-ink-900 hover:border-line-strong'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[10px] font-semibold ${locked ? 'text-mist-500' : 'text-mist-200'}`}>
                    {voice.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[9px] text-mist-600">{voice.hint}</span>
                </span>
                {locked ? <Icon name="lock" size={10} className="mt-0.5 shrink-0 text-mist-600" /> : null}
              </button>
            );
          })}
        </div>

        <div className="mt-2 grid gap-1.5">
          <label className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-[10px] text-mist-500">속도</span>
            <input
              type="range"
              data-testid="tts-rate"
              min={80}
              max={130}
              step={1}
              value={Math.round(audio.voiceRate * 100)}
              onChange={(event) => setAudio({ voiceRate: Number(event.target.value) / 100 })}
              className="h-1 flex-1"
            />
            <span className="mono w-9 text-right text-[10px] text-mist-500">{audio.voiceRate.toFixed(2)}×</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-[10px] text-mist-500">음성</span>
            <input
              type="range"
              data-testid="tts-volume"
              min={0}
              max={100}
              step={1}
              value={Math.round(audio.voiceVolume * 100)}
              onChange={(event) => setAudio({ voiceVolume: Number(event.target.value) / 100 })}
              className="h-1 flex-1"
            />
            <span className="mono w-9 text-right text-[10px] text-mist-500">{Math.round(audio.voiceVolume * 100)}%</span>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-mist-400">
            <input
              type="checkbox"
              data-testid="tts-ducking"
              checked={audio.ducking}
              onChange={(event) => setAudio({ ducking: event.target.checked })}
              className="h-3 w-3"
            />
            음성이 나오면 배경음을 자동으로 낮추기 (덕킹)
          </label>
        </div>

        <div className="mt-2 rounded-[7px] border border-line-soft bg-ink-900 px-2 py-1.5" data-testid="tts-status" data-ready={narration.ready}>
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[10px] text-mist-300">
              <span
                className={`dot ${
                  narration.source === 'server'
                    ? 'bg-mint-400'
                    : narration.source === 'speech'
                      ? 'bg-amber-400'
                      : 'bg-mist-600'
                }`}
                aria-hidden="true"
              />
              {narration.source === 'server'
                ? '서버 음성'
                : narration.source === 'speech'
                  ? '브라우저 음성 (영상 미포함)'
                  : '음성 사용 불가'}
              <span className="text-mist-600">·</span>
              <span className="mono">
                {narration.ready}/{narration.total}컷 준비
              </span>
            </p>
            <button
              type="button"
              data-testid="tts-preview-all"
              onClick={() => void playAll()}
              className="btn btn-quiet h-6 gap-1 px-1.5 text-[10px]"
            >
              <Icon name="wave" size={10} />
              전체 듣기
            </button>
          </div>
          <p className="mt-1 text-[9px] leading-relaxed text-mist-600">
            {narration.source === 'server'
              ? '컷 자막을 한국어 음성으로 읽어 영상에 함께 넣습니다.'
              : '이 주소에서는 음성 서버(/api/tts)가 없어 미리보기만 브라우저 음성으로 읽습니다. Vercel 배포에서는 실제 음성이 영상에 들어갑니다.'}
          </p>
        </div>

        <ul className="mt-2 space-y-1">
          {narration.clips.map((clip, index) => (
            <li key={`${index}-${narration.texts[index]}`} className="flex items-center gap-1.5 rounded-[6px] px-0.5 py-0.5">
              <span className="mono w-4 shrink-0 text-[9px] text-mist-600">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[10px] text-mist-400">{narration.texts[index] || '—'}</span>
              <span className={`mono shrink-0 text-[9px] ${clipTone(clip, narration.source)}`}>{clipLabel(clip)}</span>
              <button
                type="button"
                data-testid={`tts-cut-${index}`}
                onClick={() => void previewVoice(narration.texts[index] ?? '', audio)}
                className="btn btn-quiet h-5 w-5 shrink-0"
                aria-label={`${index + 1}번 컷 음성 듣기`}
              >
                <Icon name="play" size={9} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
