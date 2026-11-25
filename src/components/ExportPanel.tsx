import { useMemo, useRef, useState } from 'react';
import type { Studio } from '../hooks/useShorts';
import type { NarrationView } from '../hooks/useNarration';
import { buildGuide, buildScript, buildSrt, cutStartTimes, totalDuration } from '../lib/srt';
import { copyText, downloadBlob, downloadText } from '../lib/download';
import { fileBase } from '../lib/storage';
import { buildScenePlan } from '../lib/motion/scene';
import { exportFormats, exportVideo, ExportCanceled, isVideoExportSupported, type ExportStage } from '../lib/motion/record';
import type { MotionLevel } from '../lib/motion/stage';
import { ensureClip, voiceOf } from '../lib/audio/tts';
import { getTake } from '../lib/audio/takes';
import { limitsOf, usePlan } from '../lib/plan';
import { Icon } from './Icon';

const STAGE_LABEL: Record<ExportStage, string> = {
  prepare: '그림 · 글꼴 준비',
  record: '영상 녹화 중',
  finalize: '파일 마무리',
};

/** 인스펙터 3 — 내보내기. 해상도·형식·나레이션이 모두 여기서 결정됩니다. */
export function ExportPanel({
  studio,
  narration,
  motion = 'vivid',
  onPricing,
}: {
  studio: Studio;
  narration: NarrationView;
  motion?: MotionLevel;
  onPricing: () => void;
}) {
  const { shorts, notify } = studio;
  const plan = usePlan();
  const limits = useMemo(() => limitsOf(plan), [plan]);
  const formats = useMemo(() => exportFormats(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [phase, setPhase] = useState<'voice' | ExportStage>('prepare');
  const [progress, setProgress] = useState(0);
  const [res, setRes] = useState<'720' | '1080'>('720');
  const abortRef = useRef<AbortController | null>(null);
  const base = fileBase(shorts.title);
  const videoReady = isVideoExportSupported();
  const total = useMemo(() => totalDuration(shorts.cuts), [shorts.cuts]);
  const starts = useMemo(() => cutStartTimes(shorts.cuts), [shorts.cuts]);
  const audio = shorts.audio;
  const height = res === '1080' ? 1920 : 1280;
  const width = res === '1080' ? 1080 : 720;
  const silent = audio.mood === 'off' || audio.muted;
  const rate = Math.max(0.5, narration.preset.rate * narration.delivery.rate * audio.voiceRate);

  const handleCopy = async (kind: 'script' | 'guide') => {
    setBusy(kind);
    const text = kind === 'script' ? buildScript(shorts) : buildGuide(shorts);
    const ok = await copyText(text);
    setBusy(null);
    notify(
      ok ? (kind === 'script' ? '대본을 복사했습니다.' : '컷별 가이드를 복사했습니다.') : '복사 권한이 없어요. 저장 버튼을 써 주세요.',
      ok ? 'info' : 'warn',
    );
  };

  /** 저장용 나레이션 트랙 — 호흡 블록(또는 내 목소리)을 영상 시각에 맞춰 놓습니다. */
  const prepareNarration = async () => {
    if (!audio.narration || audio.muted) return [];
    if (audio.voiceSource === 'mine') {
      return shorts.cuts
        .map((cut, index) => {
          const take = getTake(cut.id);
          if (!take) return null;
          return {
            start: starts[index] ?? 0,
            buffer: take.buffer,
            maxSeconds: cut.duration + 0.25,
            rate: 1,
            tone: 0,
            raw: true,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
    }
    const clips = await Promise.all(narration.blocks.map((block) => ensureClip(block.text, narration.voice)));
    return clips
      .map((clip, index) => {
        const block = narration.blocks[index];
        if (!clip.buffer || !block) return null;
        const first = block.cutIndexes[0] ?? 0;
        const last = block.cutIndexes[block.cutIndexes.length - 1] ?? first;
        const end = starts[last + 1] ?? total;
        // 첫 호흡은 컷 시작과 함께, 다음 호흡부터는 호흡 길이만큼 살짝 띄웁니다.
        const start = (starts[first] ?? 0) + (index === 0 ? 0 : audio.breath);
        return {
          start,
          buffer: clip.buffer,
          maxSeconds: Math.max(0.4, end - (starts[first] ?? 0) + 0.3),
          rate: rate,
          tone: audio.voiceTone,
          raw: false,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  };

  const handleVideo = async () => {
    if (busy) return;
    setBusy('video');
    setProgress(0);
    setPhase('voice');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      window.dispatchEvent(new Event('shortcut:export'));
      const tracks = await prepareNarration();
      const scenePlan = buildScenePlan(shorts);
      setPhase('prepare');
      const result = await exportVideo(scenePlan, {
        onProgress: setProgress,
        onStage: setPhase,
        audio,
        cutStarts: scenePlan.starts,
        narration: tracks.length
          ? {
              preset: voiceOf(narration.voice),
              tracks,
              gain: audio.voiceVolume,
              speed: audio.voiceRate,
              tone: audio.voiceTone,
              ducking: audio.ducking,
            }
          : null,
        signal: controller.signal,
        motion,
        width,
        height,
        platformMark: limits.platformMark,
      });
      const extension = result.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
      // 검증용 — 실제로 녹음된 오디오를 앱 안에서 되짚어 들을 수 있게 남깁니다(파일은 그대로 내려받음).
      window.__shortcutLastExport = {
        blob: result.blob,
        seconds: result.seconds,
        withAudio: result.withAudio,
        narratedCuts: result.narratedCuts,
        format: result.formatLabel,
        width: result.width,
        height: result.height,
      };
      downloadBlob(`${base}.${extension}`, result.blob);
      const sound =
        result.narratedCuts > 0
          ? `나레이션 ${result.narratedCuts}호흡 + 배경음`
          : result.withAudio
            ? '배경음'
            : '무음';
      notify(`${result.formatLabel} · ${result.width}×${result.height} · ${result.seconds.toFixed(1)}초 영상을 저장했습니다 (${sound}).`);
    } catch (error) {
      if (error instanceof ExportCanceled) {
        notify('영상 저장을 취소했습니다.', 'warn');
      } else {
        notify(error instanceof Error ? error.message : '영상을 만들지 못했습니다.', 'warn');
      }
    } finally {
      abortRef.current = null;
      setBusy(null);
      setProgress(0);
    }
  };

  const percent = Math.round(progress * 100);
  const remaining = Math.max(0, Math.ceil(total * (1 - progress)));
  const phaseLabel = phase === 'voice' ? '나레이션 준비' : STAGE_LABEL[phase];

  return (
    <div className="space-y-4">
      <section>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-mist-200">
            <Icon name="monitor" size={12} className="text-mist-500" />
            해상도 · 형식
          </h3>
          <span
            data-testid="export-format"
            data-format={formats.preferred ?? 'none'}
            className="rounded border border-line-soft px-1.5 py-0.5 text-[9px] font-medium text-mist-400"
          >
            {formats.label}
          </span>
        </div>

        <div className="seg mt-2" role="group" aria-label="해상도">
          <button
            type="button"
            className="seg-item"
            data-active={res === '720'}
            data-testid="export-res-720"
            onClick={() => setRes('720')}
          >
            720p HD
            <span className="ml-1 text-[9px] text-mist-600">가볍게</span>
          </button>
          <button
            type="button"
            className="seg-item"
            data-active={res === '1080'}
            data-testid="export-res-1080"
            onClick={() => {
              if (limits.maxHeight < 1920) {
                notify('1080p FHD는 Pro부터입니다. 무료 체험으로 열 수 있어요.', 'warn');
                onPricing();
                return;
              }
              setRes('1080');
            }}
          >
            1080p FHD
            {limits.maxHeight < 1920 ? (
              <Icon name="lock" size={10} className="ml-1 inline text-mist-600" />
            ) : (
              <span className="ml-1 text-[9px] text-mint-400/80">Pro</span>
            )}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-mist-600">
          {formats.preferred === 'mp4'
            ? '이 브라우저는 MP4(H.264 · AAC)로 녹화합니다 — 편집 앱과 플랫폼 업로드에 그대로 씁니다.'
            : formats.preferred === 'webm'
              ? `${formats.mp4 ? 'MP4 인코더를 못 찾아' : '이 브라우저는 MP4(H.264) 녹화를 지원하지 않아'} WebM(VP9 · Opus)으로 저장합니다 — 유튜브·틱톡 모두 업로드됩니다.`
              : '이 브라우저는 영상 녹화를 지원하지 않습니다.'}
          {limits.platformMark ? ' Free 플랜은 하단에 숏컷 스튜디오 표식이 들어갑니다.' : ''}
        </p>
      </section>

      <button
        type="button"
        data-testid="export-video"
        onClick={() => void handleVideo()}
        disabled={busy !== null || !videoReady}
        title={videoReady ? '지금 재생되는 모션 일러스트를 그대로 녹화합니다' : '이 브라우저는 영상 녹화를 지원하지 않습니다'}
        className="btn btn-primary h-10 w-full text-[12px] font-semibold"
      >
        {busy === 'video' ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-mist-600 border-t-ink-950" aria-hidden="true" />
            {percent}%
          </>
        ) : (
          <>
            <Icon name="download" size={14} />
            영상 저장 · {width}×{height}
          </>
        )}
      </button>

      {busy === 'video' ? (
        <div className="rounded-[8px] border border-line-soft bg-ink-900 p-2.5" data-testid="export-progress" data-stage={phase}>
          <div className="flex items-baseline justify-between text-[10px]">
            <span className="font-medium text-mist-200" data-testid="export-stage">
              {phaseLabel}
            </span>
            <span className="mono text-mist-500">{percent}%</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-700">
            <div className="h-full rounded-full bg-mist-100 transition-[width] duration-150" style={{ width: `${Math.max(2, percent)}%` }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-mist-600">
            <span>
              {phase === 'voice'
                ? '컷 자막의 음성을 서버에서 받는 중'
                : phase === 'record'
                  ? `남은 시간 약 ${remaining}초 · 실시간 녹화`
                  : '잠시만 기다려 주세요'}
            </span>
            <button
              type="button"
              data-testid="export-cancel"
              onClick={() => abortRef.current?.abort()}
              className="btn btn-ghost h-6 px-1.5 text-[10px]"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[10px] leading-relaxed text-mist-600">
          {videoReady
            ? `그림 움직임·자막·워터마크·나레이션까지 그대로 9:16 영상으로 녹화합니다. ${
                silent
                  ? '지금은 무음으로 저장됩니다.'
                  : audio.narration
                    ? audio.voiceSource === 'mine'
                      ? '내 목소리와 배경음이 함께 들어갑니다.'
                      : 'AI 음성과 배경음이 함께 들어갑니다.'
                    : '배경음이 함께 들어갑니다.'
              }`
            : '영상 저장은 크롬·엣지에서 됩니다. 지금은 대본·자막·가이드로 꺼낼 수 있어요.'}
        </p>
      )}

      {total > 30 && !busy ? (
        <p className="text-[10px] leading-relaxed text-mist-600">
          {Math.round(total)}초짜리라 녹화도 약 {Math.round(total)}초 걸립니다. 그동안 이 화면을 닫지 마세요.
          {total > 60 ? ' (쇼츠는 60초까지라 3분할 업로드를 권합니다)' : ''}
        </p>
      ) : null}

      <div className="rounded-[8px] border border-line-soft bg-ink-900 px-2.5 py-2">
        <p className="text-[10px] font-medium text-mist-300">이 영상에 담기는 것</p>
        <ul className="mt-1 space-y-0.5 text-[10px] text-mist-500">
          <li className="flex items-center justify-between">
            <span>나레이션</span>
            <span className={audio.narration ? 'text-mist-300' : ''}>
              {audio.narration
                ? audio.voiceSource === 'mine'
                  ? `내 목소리 ${narration.takesCount}/${shorts.cuts.length}컷`
                  : `${narration.ready}/${narration.total}호흡 · ${narration.delivery.label}`
                : '꺼짐'}
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span>배경음</span>
            <span className={silent ? '' : 'text-mist-300'}>{silent ? '무음' : `켜짐 · ${Math.round(audio.volume * 100)}%`}</span>
          </li>
          <li className="flex items-center justify-between">
            <span>브랜드 워터마크</span>
            <span className={shorts.brand.enabled && shorts.brand.handle ? 'text-mist-300' : ''}>
              {shorts.brand.enabled && shorts.brand.handle ? `@${shorts.brand.handle}` : '꺼짐'}
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span>플랫폼 표식</span>
            <span className={limits.platformMark ? '' : 'text-mint-400'}>{limits.platformMark ? 'Free · 포함' : '제거됨'}</span>
          </li>
        </ul>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          data-testid="copy-script"
          onClick={() => void handleCopy('script')}
          disabled={busy !== null}
          className="btn btn-ghost h-8 text-[10px]"
        >
          <Icon name="copy" size={11} />
          대본 복사
        </button>
        <button
          type="button"
          data-testid="download-srt"
          onClick={() => {
            downloadText(`${base}.srt`, buildSrt(shorts), 'application/x-subrip;charset=utf-8');
            notify('자막 파일(.srt)을 저장했습니다.');
          }}
          className="btn btn-ghost h-8 text-[10px]"
        >
          <Icon name="file" size={11} />
          자막 .srt
        </button>
        <button
          type="button"
          data-testid="download-guide"
          onClick={() => {
            downloadText(`${base}_가이드.txt`, buildGuide(shorts));
            notify('컷별 가이드를 저장했습니다.');
          }}
          className="btn btn-ghost h-8 text-[10px]"
        >
          <Icon name="list" size={11} />
          가이드
        </button>
      </div>
      <div className="flex items-center justify-between px-0.5 text-[10px] text-mist-600">
        <button
          type="button"
          data-testid="download-script"
          onClick={() => {
            downloadText(`${base}_대본.txt`, buildScript(shorts));
            notify('대본 파일(.txt)을 저장했습니다.');
          }}
          className="btn btn-quiet h-5 px-1"
        >
          대본 .txt
        </button>
        <button type="button" data-testid="copy-guide" onClick={() => void handleCopy('guide')} className="btn btn-quiet h-5 px-1">
          가이드 복사
        </button>
      </div>
    </div>
  );
}
