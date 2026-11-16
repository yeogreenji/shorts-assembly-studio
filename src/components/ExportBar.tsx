import { useState } from 'react';
import type { Shorts } from '../types';
import type { Toast } from '../hooks/useShorts';
import { buildGuide, buildScript, buildSrt } from '../lib/srt';
import { copyText, downloadText } from '../lib/download';
import { fileBase } from '../lib/storage';

/** 완성된 대본·자막·컷별 가이드 — 원클릭 복사와 저장. */
export function ExportBar({
  shorts,
  notify,
  vertical = false,
}: {
  shorts: Shorts;
  notify: (message: string, tone?: Toast['tone']) => void;
  vertical?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const base = fileBase(shorts.title);

  const handleCopy = async (kind: 'script' | 'guide') => {
    setBusy(kind);
    const text = kind === 'script' ? buildScript(shorts) : buildGuide(shorts);
    const ok = await copyText(text);
    setBusy(null);
    notify(ok ? (kind === 'script' ? '대본을 복사했습니다.' : '컷별 가이드를 복사했습니다.') : '복사 권한이 없어요. 저장 버튼을 써 주세요.', ok ? 'info' : 'warn');
  };
  return (
    <div className={`w-full ${vertical ? '' : 'mt-4 border-t border-white/[0.07] pt-3'}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-zinc-300">내보내기</span>
        <span className="text-[10px] text-zinc-600">바로 완성</span>
      </div>
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
