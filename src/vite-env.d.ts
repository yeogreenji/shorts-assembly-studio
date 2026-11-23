/// <reference types="vite/client" />
import type { MotionLevel } from './lib/motion/stage';

declare global {
  interface Window {
    /** 검증용 — 지정한 시각의 프레임을 캔버스에 그립니다. */
    __shortcutRenderAt?: (at: number, level?: MotionLevel) => { at: number };
    /** 검증용 — 마지막으로 저장한 영상(오디오가 실제로 들어갔는지 확인할 때). */
    __shortcutLastExport?: {
      blob: Blob;
      seconds: number;
      withAudio: boolean;
      narratedCuts: number;
      format: string;
      width: number;
      height: number;
    };
  }
}
