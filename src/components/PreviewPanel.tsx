import { useState } from 'react';
import type { Studio } from '../hooks/useStudio';
import {
  buildExportBundle,
  buildRenderPayload,
  copyToClipboard,
  downloadBlob,
  downloadText,
  inlineImageAssets,
  renderOnServer,
  renderThumbnailPng,
  safeFileName,
} from '../lib/media';
import { Btn, Panel, SectionLabel } from './ui';
import { ShortsPlayer } from './ShortsPlayer';

export function PreviewPanel({ studio }: { studio: Studio }) {
  const { project, notify, serverUrl, setServerUrl } = studio;
  const [previewAudio, setPreviewAudio] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [renderLog, setRenderLog] = useState<string | null>(null);
  const [busyThumb, setBusyThumb] = useState(false);

  const withAudio = project.cuts.filter((cut) => cut.audio).length;
  const aiVoiceOn = Boolean(project.aiVoice?.voice);
  const withoutSubtitle = project.cuts.filter((cut) => !cut.subtitle.trim() && !cut.narration.trim()).length;
  const baseName = safeFileName(project.title, 'shorts');

  const handleSrt = () => {
    const bundle = buildExportBundle(project);
    downloadText(`${baseName}.srt`, bundle.srt, 'application/x-subrip;charset=utf-8');
    notify('SRT 자막 파일을 내려받았습니다. 유튜브·릴스에 그대로 올릴 수 있습니다.');
  };

  const handleTxt = () => {
    const bundle = buildExportBundle(project);
    downloadText(`${baseName}_대본.txt`, bundle.txt);
    notify('대본 TXT를 내려받았습니다.');
  };

  const handleJson = async () => {
    const payload = await inlineImageAssets(buildRenderPayload(project));
    downloadText(`${baseName}.json`, JSON.stringify(payload, null, 2), 'application/json');
    notify('렌더용 JSON을 내려받았습니다. scripts/render_shorts.py에 넘기면 MP4가 나옵니다.');
  };

  const handleThumb = async () => {
    setBusyThumb(true);
    try {
      const blob = await renderThumbnailPng(project);
      downloadBlob(`${baseName}_썸네일.png`, blob);
      notify('9:16 썸네일 PNG를 내려받았습니다.');
    } catch (error) {
      notify(error instanceof Error ? error.message : '썸네일을 만들지 못했습니다.', 'error');
    } finally {
      setBusyThumb(false);
    }
  };

  const handleRender = async () => {
    if (rendering) return;
    setRendering(true);
    setRenderLog('장면 이미지를 정리하고 있습니다…');
    try {
      const payload = await inlineImageAssets(buildRenderPayload(project));
      setRenderLog('렌더 서버에 요청을 보냈습니다… (AI 보이스까지 넣으면 30초~2분 걸립니다)');
      const result = await renderOnServer(payload, serverUrl, `${baseName}.mp4`);
      downloadBlob(`${baseName}.mp4`, result.blob);
      setRenderLog(`✅ 완성: ${baseName}.mp4\n${result.log}`);
      notify('MP4가 완성됐습니다. 다운로드 폴더를 확인해 주세요.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '렌더에 실패했습니다.';
      setRenderLog(`❌ ${message}`);
      notify(message, 'error');
    } finally {
      setRendering(false);
    }
  };

  const cliCommand = `cd shorts-assembly-studio && python3 scripts/render_shorts.py "${baseName}.json" -o "${baseName}.mp4" --voice edge --tts ${project.aiVoice.voice}`;

  return (
    <Panel
      step="3"
      title="9:16 미리보기 & 내보내기"
      hint="실제 화면 그대로 확인하고, 자막·대본·MP4까지 내보냅니다."
      right={
        <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[10px] text-zinc-400">1080×1920</span>
      }
    >
      <ShortsPlayer project={project} previewAudio={previewAudio} onToggleAudio={setPreviewAudio} />

      <div className="mt-3 flex flex-wrap gap-1.5">
        <StatusChip tone={withoutSubtitle === 0 ? 'ok' : 'warn'}>
          자막 {project.cuts.length - withoutSubtitle}/{project.cuts.length}
        </StatusChip>
        <StatusChip tone={withAudio > 0 || aiVoiceOn ? 'ok' : 'warn'}>
          음성 {withAudio > 0 ? `녹음 ${withAudio}컷` : aiVoiceOn ? `AI ${project.aiVoice.voiceLabel}` : '없음'}
        </StatusChip>
        <StatusChip tone={project.cuts.some((c) => c.image) ? 'ok' : 'info'}>
          이미지 {project.cuts.filter((c) => c.image).length}컷
        </StatusChip>
        <StatusChip tone={project.bgm.mood !== 'none' ? 'ok' : 'info'}>
          BGM {project.bgm.mood === 'none' ? '무음' : `${Math.round(project.bgm.volume * 100)}%`}
        </StatusChip>
      </div>
      {withAudio === 0 && !aiVoiceOn ? (
        <p className="mt-1.5 text-[10px] leading-relaxed text-amber-300/70">
          녹음도 AI 보이스도 없습니다. MP4는 자막·BGM만으로 만들어집니다. 2단계에서 AI 보이스를 골라 주세요.
        </p>
      ) : null}

      <div className="my-4 h-px bg-white/5" />

      <SectionLabel right={<span className="text-[10px] text-zinc-600">바로 쓰는 파일</span>}>내보내기</SectionLabel>
      <div className="grid grid-cols-2 gap-1.5">
        <Btn variant="primary" onClick={handleSrt}>
          📝 SRT 자막
        </Btn>
        <Btn variant="soft" onClick={handleTxt}>
          📄 대본 TXT
        </Btn>
        <Btn variant="ghost" onClick={() => void handleJson()}>
          🧩 렌더 JSON
        </Btn>
        <Btn variant="ghost" onClick={() => void handleThumb()} disabled={busyThumb}>
          🖼 썸네일 PNG
        </Btn>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-3">
        <SectionLabel right={<span className="text-[10px] text-zinc-600">FFmpeg 1회 세팅</span>}>
          MP4 자동 조립
        </SectionLabel>
        <p className="mb-2 text-[10px] leading-relaxed text-zinc-500">
          터미널에서 <code className="rounded bg-white/10 px-1">npm run render-server</code>를 켜두면 이 화면에서
          바로 MP4를 받습니다. 서버 없이 JSON만 내려받아 명령어로 조립해도 됩니다.
        </p>
        <div className="flex gap-1.5">
          <input
            value={serverUrl}
            onChange={(event) => setServerUrl(event.target.value)}
            className="field flex-1 font-mono text-[11px]"
            placeholder="http://localhost:8787"
            aria-label="렌더 서버 주소"
          />
          <Btn variant="primary" onClick={() => void handleRender()} disabled={rendering}>
            {rendering ? '⏳ 조립 중…' : '🎬 MP4 만들기'}
          </Btn>
        </div>
        {renderLog ? (
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/60 p-2 text-[10px] leading-relaxed text-zinc-400">
            {renderLog}
          </pre>
        ) : null}
        <div className="mt-2 flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-black/60 px-2 py-1.5 text-[10px] text-zinc-500">
            {cliCommand}
          </code>
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => {
              void copyToClipboard(cliCommand).then(() => notify('명령어를 복사했습니다.'));
            }}
          >
            복사
          </Btn>
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
        만든 영상은 1080×1920 · 30fps MP4(H.264)입니다. 장면 일러스트 · 상단 주제 배너 · 쇼츠식 자막 · 하단
        진행바 · AI 나레이션 · BGM이 한 번에 들어가고, 인스타 릴스·유튜브 쇼츠에 그대로 올릴 수 있습니다.
      </p>
    </Panel>
  );
}

function StatusChip({ tone, children }: { tone: 'ok' | 'warn' | 'info'; children: React.ReactNode }) {
  const tones = {
    ok: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    warn: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    info: 'border-white/10 bg-white/5 text-zinc-400',
  } as const;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${tones[tone]}`}>{children}</span>
  );
}
