import { useRef, useState } from 'react';
import type { Cut, CutRole, ThemeId } from '../types';
import { THEMES, cutRoleLabel } from '../lib/presets';
import { fileToAsset } from '../lib/media';
import { startRecording, type ActiveRecording } from '../lib/recorder';
import { speak, stopSpeaking } from '../lib/tts';
import type { VoiceStyle } from '../types';
import { Btn } from './ui';

const ROLE_OPTIONS: { id: CutRole; label: string }[] = [
  { id: 'hook', label: '훅' },
  { id: 'body', label: '본문' },
  { id: 'cta', label: '투표' },
];

const ROLE_STYLE: Record<CutRole, string> = {
  hook: 'bg-amber-400/20 text-amber-300 border-amber-400/40',
  body: 'bg-sky-400/15 text-sky-300 border-sky-400/30',
  cta: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
};

export function CutCard({
  cut,
  index,
  total,
  voice,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
  onNotify,
}: {
  cut: Cut;
  index: number;
  total: number;
  voice: VoiceStyle;
  onChange: (changes: Partial<Cut>) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onNotify: (message: string, tone?: 'info' | 'warn' | 'error') => void;
}) {
  const [busy, setBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<ActiveRecording | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [speaking, setSpeaking] = useState(false);

  const handleImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const asset = await fileToAsset(file, 'image');
      onChange({ image: asset });
      onNotify('배경 이미지를 넣었습니다. 자동으로 천천히 확대되는 효과가 붙습니다.');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '이미지를 넣지 못했습니다.', 'error');
    } finally {
      setBusy(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleAudio = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const asset = await fileToAsset(file, 'audio');
      onChange({ audio: asset });
      onNotify('이 컷의 나레이션 오디오를 넣었습니다. MP4 조립 때 이 소리가 들어갑니다.');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '오디오를 넣지 못했습니다.', 'error');
    } finally {
      setBusy(false);
      if (audioInputRef.current) audioInputRef.current.value = '';
    }
  };

  const toggleRecord = async () => {
    if (isRecording) {
      const active = recordingRef.current;
      recordingRef.current = null;
      setIsRecording(false);
      if (!active) return;
      try {
        const asset = await active.stop();
        onChange({ audio: asset });
        onNotify('녹음 완료. 이 컷에 내 목소리를 넣었습니다.');
      } catch (error) {
        onNotify(error instanceof Error ? error.message : '녹음을 저장하지 못했습니다.', 'error');
      }
      return;
    }
    try {
      const active = await startRecording();
      recordingRef.current = active;
      setIsRecording(true);
      onNotify('녹음 중입니다. 다 읽었으면 🎙 버튼을 다시 눌러 주세요.');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '마이크를 열지 못했습니다.', 'error');
    }
  };

  const previewVoice = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const text = cut.narration.trim() || cut.subtitle.replace(/\*/g, '').trim();
    if (!text) return;
    setSpeaking(true);
    speak({
      text,
      voiceURI: voice.voiceURI,
      rate: voice.rate,
      pitch: voice.pitch,
      volume: voice.volume,
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  return (
    <article className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition hover:border-white/15">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-[11px] font-bold text-zinc-200">
          {index + 1}
        </span>
        <select
          value={cut.role}
          onChange={(event) => onChange({ role: event.target.value as CutRole })}
          className={`rounded-md border px-1.5 py-1 text-[10px] font-semibold outline-none ${ROLE_STYLE[cut.role]}`}
          aria-label="컷 역할"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id} className="bg-zinc-900 text-zinc-100">
              {option.label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1">
          <div className="flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5">
            <input
              type="number"
              min={1}
              max={15}
              step={0.5}
              value={cut.duration}
              onChange={(event) => {
                const next = Number(event.target.value);
                onChange({ duration: Number.isFinite(next) ? Math.min(15, Math.max(1, next)) : 4 });
              }}
              className="w-9 bg-transparent text-right text-[11px] font-mono text-zinc-200 outline-none"
              aria-label={`${index + 1}번 컷 길이(초)`}
            />
            <span className="text-[10px] text-zinc-500">초</span>
          </div>
          <button
            type="button"
            title="위로"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="rounded-md px-1.5 py-1 text-[11px] text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            title="아래로"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            className="rounded-md px-1.5 py-1 text-[11px] text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            title="복제"
            onClick={onDuplicate}
            className="rounded-md px-1.5 py-1 text-[11px] text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            ⧉
          </button>
          <button
            type="button"
            title="삭제"
            disabled={total <= 1}
            onClick={onRemove}
            className="rounded-md px-1.5 py-1 text-[11px] text-zinc-500 hover:bg-red-500/15 hover:text-red-300 disabled:opacity-30"
          >
            ✕
          </button>
        </div>
      </div>

      <input
        value={cut.headline}
        onChange={(event) => onChange({ headline: event.target.value })}
        placeholder="헤드라인 (썸네일 카피)"
        className="field mb-1.5 text-[13px] font-bold"
      />

      <textarea
        value={cut.subtitle}
        onChange={(event) => onChange({ subtitle: event.target.value })}
        placeholder="자막 — *별표*로 감싼 단어는 강조색으로 뜹니다"
        rows={2}
        className="field mb-1.5 resize-none text-[13px] leading-snug"
      />

      <div className="mb-2 flex items-start gap-1.5">
        <textarea
          value={cut.narration}
          onChange={(event) => onChange({ narration: event.target.value })}
          placeholder="나레이션 (TTS가 읽는 문장)"
          rows={2}
          className="field resize-none text-[12px] leading-snug text-zinc-300"
        />
        <button
          type="button"
          onClick={previewVoice}
          title="이 컷 나레이션 미리듣기"
          className={`mt-0.5 rounded-md border px-2 py-2 text-[12px] transition ${
            speaking
              ? 'border-brand-400/60 bg-brand-500/20 text-brand-200'
              : 'border-white/10 text-zinc-400 hover:border-white/25 hover:text-white'
          }`}
        >
          {speaking ? '⏹' : '🔊'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            title={`${theme.name} 배경`}
            onClick={() => onChange({ theme: theme.id as ThemeId })}
            className={`h-5 w-5 rounded-full ring-offset-1 ring-offset-ink-900 transition ${
              cut.theme === theme.id ? 'ring-2 ring-white/80' : 'ring-1 ring-white/15 hover:ring-white/40'
            }`}
            style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
          />
        ))}

        <span className="mx-0.5 h-4 w-px bg-white/10" />

        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={busy}
          className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-zinc-400 hover:border-white/25 hover:text-white"
        >
          {cut.image ? '🖼 이미지 교체' : '🖼 배경 이미지'}
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => void handleImage(event.target.files?.[0])}
        />

        <button
          type="button"
          onClick={() => audioInputRef.current?.click()}
          disabled={busy}
          className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-zinc-400 hover:border-white/25 hover:text-white"
        >
          ♪ 오디오
        </button>
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*,video/mp4"
          hidden
          onChange={(event) => void handleAudio(event.target.files?.[0])}
        />

        <button
          type="button"
          onClick={() => void toggleRecord()}
          className={`rounded-md border px-2 py-1 text-[10px] transition ${
            isRecording
              ? 'border-red-400/60 bg-red-500/20 text-red-200'
              : 'border-white/10 text-zinc-400 hover:border-white/25 hover:text-white'
          }`}
        >
          {isRecording ? '■ 녹음 중지' : '🎙 내 목소리 녹음'}
        </button>

        {cut.image ? (
          <button
            type="button"
            onClick={() => onChange({ image: null })}
            className="rounded-md border border-white/10 px-1.5 py-1 text-[10px] text-zinc-500 hover:text-red-300"
            title="이미지 빼기"
          >
            이미지 ✕
          </button>
        ) : null}
        {cut.audio ? (
          <button
            type="button"
            onClick={() => onChange({ audio: null })}
            className="rounded-md border border-white/10 px-1.5 py-1 text-[10px] text-emerald-300/90 hover:text-red-300"
            title={`${cut.audio.name} — 빼기`}
          >
            ♪ 음성 ✕
          </button>
        ) : null}
      </div>

      {cut.image ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/5 bg-black/30 p-1.5">
          <img src={cut.image.dataUrl} alt="" className="h-10 w-8 rounded object-cover" />
          <span className="min-w-0 truncate text-[10px] text-zinc-500">{cut.image.name}</span>
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-600">
        <span>
          {cutRoleLabel(cut.role)} · {cut.duration.toFixed(1)}초 · 자막 {cut.subtitle.length}자
        </span>
        <Btn size="sm" variant="ghost" onClick={() => onChange({ subtitle: cut.subtitle.replace(/\*/g, '') })}>
          강조 지우기
        </Btn>
      </div>
    </article>
  );
}
