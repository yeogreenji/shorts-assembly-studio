/// <reference types="vite/client" />
import type { MotionLevel } from './lib/motion/stage';

declare global {
  interface Window {
    /** 검증용 — 지정한 시각의 프레임을 캔버스에 그립니다. */
    __shortcutRenderAt?: (at: number, level?: MotionLevel) => { at: number };
  }
}
