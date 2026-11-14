import { useEffect, useRef, useState } from 'react';
import type { BgmMood, SubtitlePosition } from '../types';
import { BGM_MOODS } from '../lib/presets';
import { bgmPlayer } from '../lib/bgm';
import { isTtsSupported, listVoices, loadVoices, sortVoices, speak, stopSpeaking } from '../lib/tts';
import type { Studio } from '../hooks/useStudio';
import { Btn, Chip, Panel, SectionLabel, Slider, Toggle } from './ui';

const POSITIONS: { id: SubtitlePosition; label: string }[] = [
  { id: 'top', label: '상단' },
  { id: 'middle', label: '중앙' },
  { id: 'bottom', label: '하단' },
];

export function StylePanel({ studio }: { studio: Studio }) {
  const { project, patch, notify } = studio;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [bgmOn, setBgmOn] = useState(false);
  const stopRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    void loadVoices().then((list) => {
      if (!mounted) return;
      const sorted = sortVoices(list.length ? list : listVoices());
      setVoices(sorted);
      setVoicesLoaded(true);
      if (!project.voice.voiceURI && sorted.length > 0) {
        const korean = sorted.find((v) => v.lang.toLowerCase().startsWith('ko'));
        const chosen = korean ?? sorted[0];
        if (chosen) {
          patch({
            voice: {
              ...project.voice,
              voiceURI: chosen.voiceURI,
              voiceName: chosen.name,
              lang: chosen.lang,
            },
          });
        }
      }
    });
    return () => {
      mounted = false;
      stopSpeaking();
      bgmPlayer.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (bgmOn) bgmPlayer.setVolume(project.bgm.volume);
  }, [project.bgm.volume, bgmOn]);

  const speakCutAt = (index: number) => {
    const cut = project.cuts[index];
    if (!cut || stopRef.current) {
      setSpeakingIndex(null);
      return;
    }
    const text = cut.narration.trim() || cut.subtitle.replace(/\*/g, '').trim();
    if (!text) {
      speakCutAt(index + 1);
      return;
    }
    setSpeakingIndex(index);
    speak({
      text,
      voiceURI: project.voice.voiceURI,
      rate: project.voice.rate,
      pitch: project.voice.pitch,
      volume: project.voice.volume,
      onEnd: () => {
        if (index + 1 < project.cuts.length) speakCutAt(index + 1);
        else setSpeakingIndex(null);
      },
      onError: (message) => {
        setSpeakingIndex(null);
        notify(`음성 재생 실패: ${message}`, 'warn');
      },
    });
  };

  const playAll = () => {
    if (speakingIndex !== null) {
      stopRef.current = true;
      stopSpeaking();
      setSpeakingIndex(null);
      return;
    }
    if (!isTtsSupported()) {
      notify('이 브라우저는 음성 합성을 지원하지 않습니다. 크롬·엣지·사파리를 써주세요.', 'warn');
      return;
    }
    if (voices.length === 0) {
      notify('이 기기에 설치된 음성 엔진이 없습니다. 윈도우·맥 기본 음성 설치 후 다시 시도해 주세요.', 'warn');
      return;
    }
    stopRef.current = false;
    speakCutAt(0);
  };

  const toggleBgm = () => {
    if (bgmOn) {
      bgmPlayer.stop();
      setBgmOn(false);
      return;
    }
    if (project.bgm.mood === 'none') {
      notify('BGM 분위기를 먼저 골라 주세요.', 'warn');
      return;
    }
    bgmPlayer.start(project.bgm.mood, project.bgm.volume);
    setBgmOn(true);
  };

  const applyMood = (mood: BgmMood) => {
    patch({ bgm: { ...project.bgm, mood } });
    if (bgmOn) {
      if (mood === 'none') {
        bgmPlayer.stop();
        setBgmOn(false);
      } else {
        bgmPlayer.start(mood, project.bgm.volume);
      }
    }
  };

  return (
    <Panel step="2" title="음성 · 스타일 설정" hint="목소리·속도·자막 위치·BGM을 여기서 한 번에 맞춥니다.">
      <SectionLabel
        right={
          <span className="flex items-center gap-1 text-[10px] text-zinc-500">
            <span className={`h-1.5 w-1.5 rounded-full ${speakingIndex !== null ? 'bg-emerald-400 pulse-dot' : 'bg-zinc-600'}`} />
            {speakingIndex !== null ? `${speakingIndex + 1}번 컷 읽는 중` : '대기'}
          </span>
        }
      >
        목소리 (TTS)
      </SectionLabel>

      <select
        value={project.voice.voiceURI}
        onChange={(event) => {
          const voice = voices.find((v) => v.voiceURI === event.target.value);
          patch({
            voice: {
              ...project.voice,
              voiceURI: event.target.value,
              voiceName: voice?.name ?? '',
              lang: voice?.lang ?? 'ko-KR',
            },
          });
        }}
        className="field mb-2"
      >
        {voices.length === 0 ? (
          <option value="">{voicesLoaded ? '이 브라우저에 설치된 음성이 없습니다' : '음성 엔진을 찾는 중…'}</option>
        ) : null}
        {voices.map((voice) => (
          <option key={voice.voiceURI} value={voice.voiceURI}>
            {voice.name} ({voice.lang}){voice.localService ? '' : ' · 온라인'}
          </option>
        ))}
      </select>

      {voicesLoaded && voices.length === 0 ? (
        <p className="mb-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-2 text-[10px] leading-relaxed text-amber-200/80">
          이 브라우저에는 음성 엔진이 없습니다. 아이폰·안드로이드 기본 브라우저나 크롬·엣지에서 열면 목소리
          미리듣기를 쓸 수 있습니다. (MP4에는 녹음 파일로 들어갑니다)
        </p>
      ) : null}

      <div className="space-y-2.5">
        <Slider
          label="말 속도"
          value={project.voice.rate}
          min={0.6}
          max={1.8}
          step={0.05}
          onChange={(rate) => patch({ voice: { ...project.voice, rate } })}
          display={`${project.voice.rate.toFixed(2)}x`}
          hint="쇼츠는 1.05~1.2배가 또렷합니다. 너무 빠르면 자막을 못 따라갑니다."
        />
        <Slider
          label="음 높이"
          value={project.voice.pitch}
          min={0.6}
          max={1.6}
          step={0.05}
          onChange={(pitch) => patch({ voice: { ...project.voice, pitch } })}
          display={project.voice.pitch.toFixed(2)}
        />
        <div className="flex gap-1.5">
          <Btn variant={speakingIndex !== null ? 'soft' : 'primary'} onClick={playAll} className="flex-1">
            {speakingIndex !== null ? '⏹ 멈추기' : '▶ 대본 전체 듣기'}
          </Btn>
          <Btn
            variant="ghost"
            onClick={() => {
              const cut = project.cuts[0];
              if (!cut) return;
              stopRef.current = true;
              speak({
                text: (cut.narration || cut.subtitle).replace(/\*/g, ''),
                voiceURI: project.voice.voiceURI,
                rate: project.voice.rate,
                pitch: project.voice.pitch,
                volume: project.voice.volume,
              });
            }}
            title="첫 컷만 듣기"
          >
            훅만
          </Btn>
        </div>
      </div>

      <div className="my-4 h-px bg-white/5" />

      <SectionLabel>자막</SectionLabel>
      <div className="mb-2.5 flex gap-1">
        {POSITIONS.map((position) => (
          <Chip
            key={position.id}
            active={project.subtitle.position === position.id}
            onClick={() => patch({ subtitle: { ...project.subtitle, position: position.id } })}
          >
            {position.label}
          </Chip>
        ))}
      </div>
      <div className="space-y-2.5">
        <Slider
          label="자막 크기"
          value={project.subtitle.sizePx}
          min={40}
          max={110}
          step={2}
          onChange={(sizePx) => patch({ subtitle: { ...project.subtitle, sizePx } })}
          display={`${project.subtitle.sizePx}px`}
          hint="1080×1920 기준 크기입니다. 미리보기는 비율대로 줄여 보여줍니다."
        />
        <Slider
          label="외곽선 굵기"
          value={project.subtitle.outline}
          min={0}
          max={8}
          step={1}
          onChange={(outline) => patch({ subtitle: { ...project.subtitle, outline } })}
          display={`${project.subtitle.outline}`}
          hint="밝은 배경 위에서도 읽히게 하는 안전장치입니다."
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center justify-between rounded-lg border border-white/10 px-2.5 py-2">
            <span className="text-[11px] text-zinc-400">글자색</span>
            <input
              type="color"
              value={project.subtitle.color}
              onChange={(event) => patch({ subtitle: { ...project.subtitle, color: event.target.value } })}
              className="h-6 w-9 rounded"
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-white/10 px-2.5 py-2">
            <span className="text-[11px] text-zinc-400">강조색</span>
            <input
              type="color"
              value={project.subtitle.highlight}
              onChange={(event) => patch({ subtitle: { ...project.subtitle, highlight: event.target.value } })}
              className="h-6 w-9 rounded"
            />
          </label>
        </div>
        <Toggle
          checked={project.headline.enabled}
          onChange={(enabled) => patch({ headline: { ...project.headline, enabled } })}
          label="상단 헤드라인 크게 표시"
        />
        {project.headline.enabled ? (
          <Slider
            label="헤드라인 크기"
            value={project.headline.sizePx}
            min={48}
            max={140}
            step={2}
            onChange={(sizePx) => patch({ headline: { ...project.headline, sizePx } })}
            display={`${project.headline.sizePx}px`}
          />
        ) : null}
      </div>

      <div className="my-4 h-px bg-white/5" />

      <SectionLabel
        right={
          <Btn size="sm" variant={bgmOn ? 'soft' : 'ghost'} onClick={toggleBgm}>
            {bgmOn ? '⏹ BGM 정지' : '▶ BGM 미리듣기'}
          </Btn>
        }
      >
        BGM
      </SectionLabel>
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        {BGM_MOODS.map((mood) => (
          <button
            key={mood.id}
            type="button"
            onClick={() => applyMood(mood.id)}
            className={`rounded-lg border px-2 py-1.5 text-left transition ${
              project.bgm.mood === mood.id
                ? 'border-brand-400/60 bg-brand-500/15'
                : 'border-white/10 hover:border-white/25'
            }`}
          >
            <span className="block text-[11px] font-semibold text-zinc-200">{mood.label}</span>
            <span className="block text-[9px] leading-tight text-zinc-500">{mood.hint}</span>
          </button>
        ))}
      </div>
      <Slider
        label="BGM 볼륨"
        value={project.bgm.volume}
        min={0}
        max={1}
        step={0.01}
        onChange={(volume) => patch({ bgm: { ...project.bgm, volume } })}
        display={`${Math.round(project.bgm.volume * 100)}%`}
        hint="말소리가 묻히지 않게 15~30%가 적당합니다."
      />
      <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-600">
        BGM은 브라우저에서 직접 합성합니다. 저작권 걱정 없는 소리이고, MP4로 조립할 때도 같은 분위기로 다시
        만들어 넣습니다.
      </p>

      <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-2.5">
        <p className="text-[10px] leading-relaxed text-amber-200/80">
          브라우저 목소리는 미리듣기용입니다. MP4에 목소리를 넣으려면 컷 카드의 <b>🎙 내 목소리 녹음</b>이나{' '}
          <b>♪ 오디오</b>로 파일을 넣어 주세요. 넣지 않으면 자막·BGM만 있는 영상이 나옵니다.
        </p>
      </div>
    </Panel>
  );
}
