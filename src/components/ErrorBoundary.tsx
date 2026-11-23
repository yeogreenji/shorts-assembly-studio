import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * 작업 도중 화면이 죽어도 대본을 잃지 않게 하는 마지막 안전장치.
 * 대본은 자동 저장되므로 새로고침하면 그대로 돌아옵니다.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; detail: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false, detail: '' };
  }

  static getDerivedStateFromError(error: unknown): { failed: boolean; detail: string } {
    return { failed: true, detail: error instanceof Error ? error.message : '' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 콘솔에만 남깁니다 — 사용자의 작업 내용을 밖으로 보내지 않습니다.
    console.error('숏컷 스튜디오 화면 오류', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[15px] font-black text-white">화면을 다시 불러와야 합니다</p>
        <p className="text-[12px] leading-relaxed text-zinc-400">
          작성한 대본은 브라우저에 자동 저장되어 있습니다. 새로고침하면 그대로 이어서 쓸 수 있습니다.
          {this.state.detail ? ` (${this.state.detail})` : ''}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-primary rounded-xl px-4 py-2 text-[13px] font-bold text-white"
        >
          새로고침
        </button>
      </div>
    );
  }
}
