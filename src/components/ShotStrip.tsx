import { useMemo, useRef } from 'react';
import type { Shorts, Shot } from '../types';
import { MAX_CUT_SECONDS, MIN_CUT_SECONDS, roleLabel } from '../lib/templates';
import { buildScenePlan, type CameraMove } from '../lib/motion/scene';
import { artUrl } from '../lib/motion/artLoader';
import { getImageDataUrl } from '../lib/customArt';
import type { Studio } from '../hooks/useShorts';
import type { NarrationView } from '../hooks/useNarration';
import { Icon } from './Icon';

const MOVE_LABEL: Record<CameraMove, string> = {
  push: '줌인',
  pull: '줌아웃',
  punch: '펀치인',
  whip: '휩 팬',
  drift: '패닝',
  tilt: '틸트',
  shake: '셰이크',
  handheld: '핸드헬드',
  orbit: '회전',
  slide: '슬라이드',
};

/** 컷 스트립 — 일러스트·자막·길이·음성을 한 줄에서 다듬습니다. */
export function ShotStrip({
  studio,
  narration,
  onVoice,
}: {
  studio: Studio;
  narration: NarrationView;
  onVoice: (index: number) => void;
}) {
  const { shorts, updateCut, normalizeCut, moveCut, jumpTo, setCutDuration, uploadCutImage, clearCutImage } = studio;
  const plan = useMemo(() => buildScenePlan(shorts), [shorts]);
  const last = shorts.cuts.length - 1;

  return (
    <section className="surface" aria-labelledby="cuts-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
        <h2 id="cuts-heading" className="flex items-center gap-1.5 text-[12px] font-semibold text-mist-200">
          <Icon name="film" size={13} className="text-mist-500" />
          컷 {shorts.cuts.length}개
        </h2>
        <p className="text-[10px] text-mist-600">
          <span className="text-mist-400">*단어*</span>는 강조색 · 자막은 그대로 음성으로 읽힙니다
        </p>
      </div>

      <div className="grid gap-2 p-3 sm:grid-cols-2">
        {shorts.cuts.map((cut, index) => (
          <ShotCard
            key={cut.id}
            cut={cut}
            index={index}
            total={shorts.cuts.length}
            isLast={index === last}
            artTitle={plan.cuts[index]?.art.title ?? ''}
            artFile={plan.cuts[index]?.art.file ?? ''}
            move={plan.cuts[index]?.camera.move ?? 'push'}
            framing={plan.cuts[index]?.framing ?? 'medium'}
            template={shorts.template}
            voiceState={narration.clips[index]?.status ?? 'idle'}
            voiceSource={narration.source}
            voiceOn={shorts.audio.narration}
            onChange={updateCut}
            onBlur={normalizeCut}
            onMove={moveCut}
            onJump={jumpTo}
            onDuration={setCutDuration}
            onImage={(id, file) => void uploadCutImage(id, file)}
            onClearImage={clearCutImage}
            onVoice={() => onVoice(index)}
          />
        ))}
      </div>
    </section>
  );
}

function ShotCard({
  cut,
  index,
  total,
  isLast,
  artTitle,
  artFile,
  move,
  framing,
  template,
  voiceState,
  voiceSource,
  voiceOn,
  onChange,
  onBlur,
  onMove,
  onJump,
  onDuration,
  onImage,
  onClearImage,
  onVoice,
}: {
  cut: Shot;
  index: number;
  total: number;
  isLast: boolean;
  artTitle: string;
  artFile: string;
  move: CameraMove;
  framing: 'close' | 'medium' | 'wide' | 'two-shot';
  template: Shorts['template'];
  voiceState: 'idle' | 'loading' | 'ready' | 'error';
  voiceSource: 'server' | 'speech' | 'none';
  voiceOn: boolean;
  onChange: (id: string, subtitle: string) => void;
  onBlur: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onJump: (index: number) => void;
  onDuration: (id: string, seconds: number) => void;
  onImage: (id: string, file: File) => void;
  onClearImage: (id: string) => void;
  onVoice: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const customUrl = getImageDataUrl(cut.image?.id);
  const voiceTone =
    voiceState === 'ready'
      ? 'text-mint-400'
      : voiceState === 'loading'
        ? 'text-amber-400'
        : voiceState === 'error'
          ? voiceSource === 'speech'
            ? 'text-amber-400/80'
            : 'text-red-400/80'
          : 'text-mist-600';

  return (
    <div
      className="group rounded-[10px] border border-line-soft bg-ink-900 p-2 transition hover:border-line"
      data-testid={`shot-card-${index}`}
    >
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onJump(index)}
          data-testid={`shot-jump-${index}`}
          title={`${index + 1}번 컷 · ${artTitle}부터 재생`}
          className="relative h-[76px] w-[43px] shrink-0 overflow-hidden rounded-[6px] border border-line-soft"
        >
          {customUrl || artFile ? (
            <img
              src={customUrl || artUrl(artFile)}
              alt={artTitle}
              data-testid={`shot-art-${index}`}
              data-art={artTitle}
              data-custom={customUrl ? 'true' : 'false'}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : null}
          <span className="absolute left-1 top-1 rounded bg-black/65 px-1 font-mono text-[8px] font-semibold text-mist-100">
            {String(index + 1).padStart(2, '0')}
          </span>
          {customUrl ? (
            <span className="absolute right-1 top-1 rounded bg-mint-500/85 px-1 text-[7px] font-semibold text-ink-950">내 사진</span>
          ) : null}
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent py-0.5 text-center text-[8px] font-medium text-white/85">
            {roleLabel(index, total, template)}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <p className="min-w-0 flex-1 truncate text-[10px] text-mist-500" title={artTitle}>
              {customUrl ? `내 이미지 · ${cut.image?.name ?? ''}` : artTitle || '일러스트 배정 중'}
            </p>
            <div className="flex shrink-0 gap-0.5">
              <button
                type="button"
                onClick={() => onMove(cut.id, -1)}
                disabled={index === 0}
                data-testid={`shot-move-left-${index}`}
                aria-label={`${index + 1}번째 컷 앞으로`}
                className="btn btn-quiet h-5 w-5"
              >
                <Icon name="arrowLeft" size={11} />
              </button>
              <button
                type="button"
                onClick={() => onMove(cut.id, 1)}
                disabled={isLast}
                data-testid={`shot-move-right-${index}`}
                aria-label={`${index + 1}번째 컷 뒤로`}
                className="btn btn-quiet h-5 w-5"
              >
                <Icon name="arrowRight" size={11} />
              </button>
            </div>
          </div>

          <input
            value={cut.subtitle}
            onChange={(event) => onChange(cut.id, event.target.value)}
            onBlur={() => onBlur(cut.id)}
            aria-label={`${index + 1}번째 컷 자막`}
            data-testid={`shot-subtitle-${index}`}
            placeholder="이 컷에서 할 말 한 줄"
            maxLength={60}
            className="field mt-1 h-7 py-1 text-[11px]"
          />

          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              type="range"
              min={MIN_CUT_SECONDS}
              max={MAX_CUT_SECONDS}
              step={0.1}
              value={cut.duration}
              onChange={(event) => onDuration(cut.id, Number(event.target.value))}
              aria-label={`${index + 1}번째 컷 길이`}
              data-testid={`shot-duration-${index}`}
              className="h-1 min-w-0 flex-1"
            />
            <span className="mono w-8 shrink-0 text-right text-[9px] text-mist-500">{cut.duration.toFixed(1)}s</span>
            <button
              type="button"
              data-testid={`shot-voice-${index}`}
              onClick={onVoice}
              title="이 컷 음성 미리 듣기"
              aria-label={`${index + 1}번째 컷 음성 미리 듣기`}
              className={`btn btn-quiet h-5 w-5 ${voiceTone} ${voiceOn ? '' : 'opacity-40'}`}
            >
              <Icon name="mic" size={11} />
            </button>
            <button
              type="button"
              data-testid={`shot-image-${index}`}
              onClick={() => fileInput.current?.click()}
              title="이 컷에 내 사진·캡처 넣기"
              aria-label={`${index + 1}번째 컷 이미지 넣기`}
              className="btn btn-quiet h-5 w-5"
            >
              <Icon name="image" size={11} />
            </button>
            {customUrl ? (
              <button
                type="button"
                data-testid={`shot-image-clear-${index}`}
                onClick={() => onClearImage(cut.id)}
                title="일러스트로 되돌리기"
                aria-label="내 이미지 지우기"
                className="btn btn-quiet h-5 w-5"
              >
                <Icon name="close" size={10} />
              </button>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              data-testid={`shot-image-input-${index}`}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImage(cut.id, file);
                event.target.value = '';
              }}
            />
          </div>

          <p className="mt-1 truncate text-[9px] text-mist-600" title={cut.visual?.scene}>
            {MOVE_LABEL[move]} ·{' '}
            {framing === 'two-shot' ? '두 사람' : framing === 'close' ? '클로즈업' : framing === 'wide' ? '와이드' : '인물'}
          </p>
        </div>
      </div>
    </div>
  );
}
