import type { MediaAsset } from '../types';

export interface ActiveRecording {
  stop: () => Promise<MediaAsset>;
  cancel: () => void;
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  const support = (type: string) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type);
  return candidates.find(support) ?? '';
}

/** 마이크로 해당 컷의 나레이션을 직접 녹음합니다. (MP4 조립 시 이 파일이 그대로 들어갑니다) */
export async function startRecording(): Promise<ActiveRecording> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('이 브라우저에서는 녹음을 지원하지 않습니다. (HTTPS 또는 localhost에서 열어주세요)');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  let stopped = false;
  const cleanup = () => {
    stream.getTracks().forEach((track) => track.stop());
  };

  return {
    stop: () =>
      new Promise<MediaAsset>((resolve, reject) => {
        if (stopped) {
          reject(new Error('이미 종료된 녹음입니다.'));
          return;
        }
        stopped = true;
        recorder.onstop = () => {
          cleanup();
          const type = recorder.mimeType || mimeType || 'audio/webm';
          const blob = new Blob(chunks, { type });
          if (blob.size < 400) {
            reject(new Error('녹음이 너무 짧습니다. 다시 시도해 주세요.'));
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () =>
            resolve({
              name: `녹음-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.webm`,
              dataUrl: String(reader.result ?? ''),
            });
          reader.onerror = () => reject(new Error('녹음을 저장하지 못했습니다.'));
          reader.readAsDataURL(blob);
        };
        recorder.stop();
      }),
    cancel: () => {
      stopped = true;
      try {
        recorder.stop();
      } catch {
        /* 이미 멈춤 */
      }
      cleanup();
    },
  };
}
