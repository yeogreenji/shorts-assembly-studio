import { useState } from 'react';
import type { Shorts } from '../types';
import type { Toast } from '../hooks/useShorts';
import { buildGuide, buildScript, buildSrt } from '../lib/srt';
import { copyText, downloadBlob, downloadText } from '../lib/download';
import { fileBase } from '../lib/storage';
import { buildScenePlan } from '../lib/motion/scene';
import { exportVideo, isVideoExportSupported } from '../lib/motion/record';
import type { MotionLevel } from '../lib/motion/stage';

/** 완성된 영상·대본·자막·컷별 가이드 — 원클릭 복사와 저장. */
export function ExportBar({
  shorts,
  notify,
  vertical = false,
  motion = 'vivid',
}: {
  shorts: Shorts;
  notify: (message: string, tone?: Toast['tone']) => void;
  vertical?: boolean;
  motion?: MotionLevel;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const base = fileBase(shorts.title);
  const videoReady = isVideoExportSupported();

  const handleCopy = async (kind: 'script' | 'guide') => {
    setBusy(kind);
    const text = kind === 'script' ? buildScript(shorts) : buildGuide(shorts);
    const ok = await copyText(text);
    setBusy(null);
    notify(ok ? (kind === 'script' ? '대본을 복사했습니다.' : '컷별 가이드를 복사했습니다.') : '복사 권한이 없어요. 저장 버튼을 써 주세요.', ok ? 'info' : 'warn');
  };

  const handleVideo = async () => {
    if (busy) return;
    setBusy('video');
    setProgress(0);
    try {
      window.dispatchEvent(new Event('shortcut:export'));
      const plan = buildScenePlan(shorts);
      const result = await exportVideo(plan, {
        onProgress: setProgress,
        beat: true,
        motion,
      });
      const extension = result.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
      downloadBlob(`${base}.${extension}`, result.blob);
      notify(`영상(${result.seconds.toFixed(1)}초)을 저장했습니다. 그대로 업로드하면 됩니다.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : '영상을 만들지 못했습니다.', 'warn');
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  return (
    <div className={`w-full ${vertical ? '' : 'mt-4 border-t border-white/[0.07] pt-3'}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-zinc-300">내보내기</span>
        <span className="text-[10px] text-zinc-600">바로 완성</span>
      </div>

      <button
        type="button"
        data-testid="export-video"
        onClick={() => void handleVideo()}
        disabled={busy !== null || !videoReady}
        title={videoReady ? '지금 재생되는 모션 일러스트를 그대로 녹화합니다' : '이 브라우저는 영상 녹화를 지원하지 않습니다'}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-brand-400/40 bg-brand-500/15 px-3 py-2.5 text-[12px] font-black text-brand-100 transition hover:border-brand-300/70 hover:bg-brand-500/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy === 'video' ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-200/40 border-t-brand-100" aria-hidden="true" />
            녹화 중 {Math.round(progress * 100)}%
          </>
        ) : (
          <>🎞 움직이는 영상 저장 (.webm)</>
        )}
      </button>
      <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
        {videoReady
          ? '지금 보이는 그림 움직임·자막·배너까지 그대로 9:16 영상으로 녹화됩니다(합성 비트 포함). 모션 강도도 미리보기와 같은 값으로 구워집니다.'
          : '영상 저장은 크롬·엣지에서 됩니다. 지금은 대본·자막·가이드로 꺼낼 수 있어요.'}
      </p>

      <div className={`mt-2 grid gap-1.5 ${vertical ? 'grid-cols-1' : 'grid-cols-3'}`}>
        <button
          type="button"
          data-testid="copy-script"
          onClick={() => void handleCopy('script')}
          disabled={busy !== null}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-[11px] font-semibold text-zinc-200 transition hover:border-white/25 hover:text-white disabled:opacity-60"
        >
          📋 대본 복사
        </button>
        <button
          type="button"
          data-testid="download-srt"
          onClick={() => {
            downloadText(`${base}.srt`, buildSrt(shorts), 'application/x-subrip;charset=utf-8');
            notify('자막 파일(.srt)을 저장했습니다.');
          }}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-[11px] font-semibold text-zinc-200 transition hover:border-white/25 hover:text-white"
        >
          💾 자막 .srt
        </button>
        <button
          type="button"
          data-testid="download-guide"
          onClick={() => {
            downloadText(`${base}_가이드.txt`, buildGuide(shorts));
            notify('컷별 가이드를 저장했습니다.');
          }}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-[11px] font-semibold text-zinc-200 transition hover:border-white/25 hover:text-white"
        >
          🗂 컷별 가이드
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between px-0.5 text-[10px] text-zinc-500">
        <button
          type="button"
          data-testid="download-script"
          onClick={() => {
            downloadText(`${base}_대본.txt`, buildScript(shorts));
            notify('대본 파일(.txt)을 저장했습니다.');
          }}
          className="rounded px-1 py-0.5 hover:text-zinc-200"
        >
          대본 .txt 저장
        </button>
        <button
          type="button"
          data-testid="copy-guide"
          onClick={() => void handleCopy('guide')}
          className="rounded px-1 py-0.5 hover:text-zinc-200"
        >
          가이드 복사
        </button>
      </div>
    </div>
  );
}
