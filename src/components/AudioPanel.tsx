import { useCallback, useEffect, useRef, useState } from 'react';
import type { Studio } from '../hooks/useShorts';
import type { NarrationView } from '../hooks/useNarration';
import { MOOD_LIST, previewMood } from '../lib/audio/bgm';
import { VOICES, clipLabel, ensureClip, getClip, ttsServerStatus, voiceOf, type Clip } from '../lib/audio/tts';
import { DELIVERIES } from '../lib/audio/narration';
import { getTake, startRecording, type Recording } from '../lib/audio/takes';
import { previewMix } from '../lib/audio/mixer';
import { Icon } from './Icon';

function clipTone(clip: Clip, source: 'server' | 'speech' | 'none'): string {
  if (clip.status === 'ready') return 'text-mint-400';
  if (clip.status === 'loading') return 'text-amber-400';
  if (clip.status === 'error') return source === 'speech' ? 'text-amber-400/80' : 'text-red-400/80';
  return 'text-mist-600';
}

const ENGINE_LABEL: Record<string, string> = {
  openai: 'OpenAI 음성',
  elevenlabs: 'ElevenLabs 음성',
  'google-translate': 'Google 음성',
  google: 'Google 음성',
};

/** 인스펙터 1 — 배경음과 나레이션(화자 스타일 · 내 목소리 · 엔진 상태). */
export function AudioPanel({
  studio,
  narration,
  onPricing,
}: {
  studio: Studio;
  narration: NarrationView;
  onPricing: () => void;
}) {
  const { shorts, setAudio, notify, attachVoiceTake, removeVoiceTake } = studio;
  const audio = shorts.audio;
  const [recording, setRecording] = useState<{ index: number; rec: Recording } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busyTake, setBusyTake] = useState<number | null>(null);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const status = ttsServerStatus();

  useEffect(() => {
    if (!recording) return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(recording.rec.elapsed()), 120);
    return () => window.clearInterval(timer);
  }, [recording]);

  const playAll = useCallback(async () => {
    if (!audio.narration) {
      notify('나레이션을 먼저 켜 주세요.', 'warn');
      return;
    }
    if (audio.voiceSource === 'mine') {
      const takes = shorts.cuts.map((cut) => getTake(cut.id)).filter(Boolean);
      if (!takes.length) {
        notify('녹음된 컷이 아직 없습니다. 컷마다 녹음해 주세요.', 'warn');
        return;
      }
      for (const take of takes) {
        if (!take) continue;
        const running = await previewMix.resume();
        if (!running) return;
        const played = previewMix.playVoice(take.buffer, voiceOf(narration.voice), undefined, {
          rate: 1,
          gain: audio.voiceVolume,
          duck: audio.ducking,
          warmth: 0.6,
        });
        await new Promise((resolve) => window.setTimeout(resolve, ((played?.duration ?? 1) + 0.25) * 1000));
      }
      return;
    }
    for (const block of narration.blocks) {
      const clip = await ensureClip(block.text, narration.voice);
      if (clip.status !== 'ready' || !clip.buffer) {
        notify('음성을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 'warn');
        return;
      }
      const running = await previewMix.resume();
      if (!running) return;
      const preset = voiceOf(narration.voice);
      const played = previewMix.playVoice(clip.buffer, preset, undefined, {
        rate: narration.preset.rate * narration.delivery.rate * audio.voiceRate,
        tone: audio.voiceTone,
        gain: audio.voiceVolume,
        duck: audio.ducking,
        lowShelf: preset.lowShelf,
        lowpass: preset.lowpass,
        warmth: preset.warmth + narration.delivery.warmth,
      });
      await new Promise((resolve) => window.setTimeout(resolve, ((played?.duration ?? 1) + audio.breath) * 1000));
    }
  }, [audio, narration, notify, shorts.cuts]);

  const recordTarget = useRef('');

  const beginRecord = async (index: number, cutId: string) => {
    if (recording) return;
    try {
      const rec = await startRecording();
      setRecording({ index, rec });
      // 컷 id는 종료 시점에 쓰도록 클로저에 담아 둡니다.
      recordTarget.current = cutId;
    } catch (error) {
      notify(error instanceof Error ? error.message : '녹음을 시작하지 못했습니다.', 'warn');
    }
  };

  const finishRecord = async (save: boolean) => {
    if (!recording) return;
    const { rec } = recording;
    setRecording(null);
    if (!save) {
      rec.cancel();
      return;
    }
    try {
      const blob = await rec.stop();
      await attachVoiceTake(recordTarget.current, blob, 'mic', `녹음 ${new Date().toLocaleTimeString('ko-KR')}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : '녹음을 저장하지 못했습니다.', 'warn');
    }
  };

  const uploadTake = async (index: number, cutId: string, file: File) => {
    setBusyTake(index);
    try {
      await attachVoiceTake(cutId, file, 'file', file.name);
    } finally {
      setBusyTake(null);
    }
  };

  return (
    <div className="space-y-4">
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
        <div className="mt-2 grid grid-cols-5 gap-1">
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
                className={`rounded-[5px] border px-1 py-1.5 text-[10px] font-medium transition ${
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
          <span className="text-[10px] text-mist-600">{audio.mood === 'off' || audio.muted ? '무음으로 저장됩니다' : '영상에 함께 녹음됩니다'}</span>
        </div>
      </section>

      {/* ── 나레이션 ───────────────────────────── */}
      <section className="border-t border-line-soft pt-3.5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-mist-200">
            <Icon name="mic" size={12} className="text-mist-500" />
            나레이션
          </h3>
          <button
            type="button"
            data-testid="tts-toggle"
            aria-pressed={audio.narration}
            onClick={() => setAudio({ narration: !audio.narration })}
            className={`btn h-6 border px-2 text-[10px] font-semibold ${
              audio.narration ? 'border-mint-500/45 bg-mint-500/10 text-mint-300' : 'border-line bg-ink-900 text-mist-500'
            }`}
          >
            {audio.narration ? '켜짐' : '꺼짐'}
          </button>
        </div>

        <div className="seg mt-2" role="group" aria-label="나레이션 소스">
          <button
            type="button"
            className="seg-item"
            data-testid="voice-source-ai"
            data-active={audio.voiceSource === 'ai'}
            aria-pressed={audio.voiceSource === 'ai'}
            onClick={() => setAudio({ voiceSource: 'ai' })}
          >
            AI 음성
          </button>
          <button
            type="button"
            className="seg-item"
            data-testid="voice-source-mine"
            data-active={audio.voiceSource === 'mine'}
            aria-pressed={audio.voiceSource === 'mine'}
            onClick={() => setAudio({ voiceSource: 'mine' })}
          >
            내 녹음 · 파일
          </button>
        </div>

        {audio.voiceSource === 'ai' ? (
          <>
            <div className="mt-2">
              <div className="flex items-baseline justify-between">
                <p className="text-[10px] font-medium text-mist-300">화자 스타일</p>
                <span className="max-w-[62%] truncate text-[9px] text-mist-600">{narration.delivery.hint}</span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {DELIVERIES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`delivery-${item.id}`}
                    aria-pressed={audio.delivery === item.id}
                    data-active={audio.delivery === item.id}
                    onClick={() => setAudio({ delivery: item.id, breath: item.breath })}
                    title={item.hint}
                    className={`rounded-[5px] border px-1.5 py-1 text-left text-[10px] font-medium transition ${
                      audio.delivery === item.id
                        ? 'border-mist-500/60 bg-ink-750 text-mist-100'
                        : 'border-line-soft bg-ink-900 text-mist-400 hover:border-line-strong hover:text-mist-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
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
                    className={`flex items-start gap-1.5 rounded-[5px] border px-1.5 py-1 text-left transition ${
                      active ? 'border-mist-500/60 bg-ink-750' : 'border-line-soft bg-ink-900 hover:border-line-strong'
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
                <span className="w-10 shrink-0 text-[10px] text-mist-500">속도</span>
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
                <span className="w-10 shrink-0 text-[10px] text-mist-500">톤</span>
                <input
                  type="range"
                  data-testid="tts-tone"
                  min={-120}
                  max={120}
                  step={5}
                  value={audio.voiceTone}
                  onChange={(event) => setAudio({ voiceTone: Number(event.target.value) })}
                  className="h-1 flex-1"
                />
                <span className="mono w-9 text-right text-[10px] text-mist-500">
                  {audio.voiceTone > 0 ? '+' : ''}
                  {audio.voiceTone}
                </span>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[10px] text-mist-500">호흡</span>
                <input
                  type="range"
                  data-testid="tts-breath"
                  min={10}
                  max={60}
                  step={2}
                  value={Math.round(audio.breath * 100)}
                  onChange={(event) => setAudio({ breath: Number(event.target.value) / 100 })}
                  className="h-1 flex-1"
                />
                <span className="mono w-9 text-right text-[10px] text-mist-500">{audio.breath.toFixed(2)}s</span>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[10px] text-mist-500">음성</span>
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
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <label className="flex items-center gap-1.5 text-[10px] text-mist-400">
                  <input
                    type="checkbox"
                    data-testid="tts-ducking"
                    checked={audio.ducking}
                    onChange={(event) => setAudio({ ducking: event.target.checked })}
                    className="h-3 w-3"
                  />
                  덕킹 (음성 구간 배경음 자동 낮춤)
                </label>
                <label className="flex items-center gap-1.5 text-[10px] text-mist-400">
                  <input
                    type="checkbox"
                    data-testid="tts-autofit"
                    checked={audio.autoFit}
                    onChange={(event) => setAudio({ autoFit: event.target.checked })}
                    className="h-3 w-3"
                  />
                  음성 길이에 컷 자동 맞춤
                </label>
              </div>
            </div>

            <div
              className="mt-2 rounded-[6px] border border-line-soft bg-ink-900 px-2 py-1.5"
              data-testid="tts-status"
              data-ready={narration.ready}
              data-blocks={narration.total}
              data-engine={narration.engine || ''}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[10px] text-mist-300">
                  <span
                    className={`dot ${
                      narration.source === 'server' ? 'bg-mint-400' : narration.source === 'speech' ? 'bg-amber-400' : 'bg-mist-600'
                    }`}
                    aria-hidden="true"
                  />
                  {narration.source === 'server'
                    ? `서버 음성 · ${ENGINE_LABEL[narration.engine] ?? narration.engine ?? '자동'}`
                    : narration.source === 'speech'
                      ? '브라우저 음성 (영상 미포함)'
                      : '음성 사용 불가'}
                  <span className="text-mist-600">·</span>
                  <span className="mono">
                    {narration.ready}/{narration.total}호흡
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
                  ? status && !status.engines.openai
                    ? `컷 ${narration.blocks.reduce((sum, block) => sum + block.cutIndexes.length, 0)}개를 ${narration.total}번의 호흡으로 이어 읽습니다. OPENAI_API_KEY를 연결하면 더 자연스러운 음성으로 바뀝니다.`
                    : `컷을 ${narration.total}번의 호흡으로 이어 읽습니다 — 문장이 끊기지 않습니다.`
                  : '이 주소에서는 음성 서버(/api/tts)가 없어 미리보기만 브라우저 음성으로 읽습니다. Vercel 배포에서는 실제 음성이 영상에 들어갑니다.'}
              </p>
            </div>

            <ul className="mt-2 space-y-1" data-testid="tts-block-list">
              {narration.blocks.map((block, index) => {
                const clip = narration.clips[index] ?? { status: 'idle' as const, seconds: 0 };
                return (
                  <li
                    key={`${index}-${block.text.slice(0, 8)}`}
                    data-testid={`tts-block-${index}`}
                    className="flex items-start gap-1.5 rounded-[4px] px-0.5 py-0.5"
                  >
                    <span className="mono mt-[1px] w-8 shrink-0 text-[9px] text-mist-600">
                      {block.cutIndexes.length}컷
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[10px] text-mist-400" title={block.text}>
                      {block.text}
                    </span>
                    <span className={`mono mt-[1px] shrink-0 text-[9px] ${clipTone(clip, narration.source)}`}>
                      {clipLabel(clip)}
                    </span>
                    <button
                      type="button"
                      data-testid={`tts-block-play-${index}`}
                      onClick={() => {
                        const preset = voiceOf(narration.voice);
                        const ready = getClip(block.text, narration.voice);
                        void ensureClip(block.text, narration.voice).then((clipNow) => {
                          if (clipNow.status !== 'ready' || !clipNow.buffer) return;
                          void previewMix.resume().then(() =>
                            previewMix.playVoice(clipNow.buffer as AudioBuffer, preset, undefined, {
                              rate: preset.rate * narration.delivery.rate * audio.voiceRate,
                              tone: audio.voiceTone,
                              gain: audio.voiceVolume,
                              duck: audio.ducking,
                              lowShelf: preset.lowShelf,
                              lowpass: preset.lowpass,
                              warmth: preset.warmth + narration.delivery.warmth,
                            }),
                          );
                        });
                        if (ready.status === 'ready') notify('이 호흡을 재생합니다.');
                      }}
                      className="btn btn-quiet h-4 w-4 shrink-0"
                      aria-label={`${index + 1}번 호흡 듣기`}
                    >
                      <Icon name="play" size={8} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="mt-2" data-testid="take-panel">
            <p className="text-[10px] leading-relaxed text-mist-500">
              컷마다 직접 녹음하거나, 성우·클로바더빙에서 받은 MP3/WAV를 올리세요. 붙인 길이에 맞춰 컷이 늘어나고
              영상에도 그대로 들어갑니다.
            </p>
            <div className="mt-1.5 flex items-center justify-between rounded-[5px] border border-line-soft bg-ink-900 px-2 py-1 text-[10px]">
              <span className="text-mist-400">
                녹음 {narration.takesCount}/{shorts.cuts.length}컷
              </span>
              <button
                type="button"
                data-testid="take-preview-all"
                onClick={() => void playAll()}
                className="btn btn-quiet h-5 gap-1 px-1 text-[10px]"
              >
                <Icon name="wave" size={9} />
                이어 듣기
              </button>
            </div>

            <ul className="mt-1.5 space-y-1">
              {shorts.cuts.map((cut, index) => {
                const take = narration.takes[index];
                const isRecording = recording?.index === index;
                return (
                  <li
                    key={cut.id}
                    data-testid={`take-row-${index}`}
                    data-take={take ? 'true' : 'false'}
                    className="flex items-center gap-1 rounded-[4px] border border-line-soft bg-ink-900 px-1.5 py-1"
                  >
                    <span className="mono w-4 shrink-0 text-[9px] text-mist-600">{String(index + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1 truncate text-[10px] text-mist-400" title={take?.name ?? cut.subtitle}>
                      {isRecording ? `녹음 중 ${elapsed.toFixed(1)}s` : take ? `${take.seconds.toFixed(1)}s · ${take.name}` : cut.subtitle}
                    </span>
                    {isRecording ? (
                      <>
                        <button
                          type="button"
                          data-testid={`take-stop-${index}`}
                          onClick={() => void finishRecord(true)}
                          className="btn h-5 shrink-0 border border-mint-500/50 bg-mint-500/15 px-1 text-[9px] font-semibold text-mint-300"
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          data-testid={`take-cancel-${index}`}
                          onClick={() => void finishRecord(false)}
                          aria-label="녹음 취소"
                          className="btn btn-quiet h-5 w-5 shrink-0"
                        >
                          <Icon name="close" size={9} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          data-testid={`take-record-${index}`}
                          onClick={() => void beginRecord(index, cut.id)}
                          disabled={Boolean(recording) || busyTake !== null}
                          title="이 컷 녹음"
                          aria-label={`${index + 1}번째 컷 녹음`}
                          className="btn btn-quiet h-5 w-5 shrink-0 text-mist-400 disabled:opacity-40"
                        >
                          <Icon name="mic" size={10} />
                        </button>
                        <button
                          type="button"
                          data-testid={`take-file-${index}`}
                          onClick={() => fileInputs.current[index]?.click()}
                          disabled={busyTake !== null}
                          title="오디오 파일 올리기(MP3·WAV·M4A)"
                          aria-label={`${index + 1}번째 컷 오디오 올리기`}
                          className="btn btn-quiet h-5 w-5 shrink-0 text-mist-400 disabled:opacity-40"
                        >
                          <Icon name="upload" size={10} />
                        </button>
                        {take ? (
                          <>
                            <button
                              type="button"
                              data-testid={`take-play-${index}`}
                              onClick={() => {
                                void previewMix.resume().then(() =>
                                  previewMix.playVoice(take.buffer, voiceOf(narration.voice), undefined, {
                                    rate: 1,
                                    gain: audio.voiceVolume,
                                    duck: false,
                                    warmth: 0.6,
                                  }),
                                );
                              }}
                              aria-label={`${index + 1}번째 컷 녹음 듣기`}
                              className="btn btn-quiet h-5 w-5 shrink-0 text-mint-400"
                            >
                              <Icon name="play" size={9} />
                            </button>
                            <button
                              type="button"
                              data-testid={`take-clear-${index}`}
                              onClick={() => removeVoiceTake(cut.id)}
                              aria-label={`${index + 1}번째 컷 녹음 지우기`}
                              className="btn btn-quiet h-5 w-5 shrink-0"
                            >
                              <Icon name="close" size={9} />
                            </button>
                          </>
                        ) : null}
                      </>
                    )}
                    <input
                      ref={(node) => {
                        fileInputs.current[index] = node;
                      }}
                      type="file"
                      accept="audio/*"
                      data-testid={`take-file-input-${index}`}
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadTake(index, cut.id, file);
                        event.target.value = '';
                      }}
                    />
                  </li>
                );
              })}
            </ul>
            <p className="mt-1.5 text-[9px] leading-relaxed text-mist-600">
              녹음·파일은 이 브라우저(IndexedDB)에만 저장되고 서버로 보내지 않습니다. 컷을 지우면 함께 정리됩니다.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
