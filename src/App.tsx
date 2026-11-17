import { useShorts } from './hooks/useShorts';
import { Header } from './components/Header';
import { TopicPanel } from './components/TopicPanel';
import { ShortsPlayer } from './components/ShortsPlayer';
import { ShotStrip } from './components/ShotStrip';
import { ExportBar } from './components/ExportBar';

export default function App() {
  const studio = useShorts();
  const { shorts } = studio;

  return (
    <div className="min-h-dvh pb-8">
      <Header saved={studio.saved} />

      <main className="mx-auto w-full max-w-6xl px-3 pb-8 pt-3 sm:px-6 sm:pt-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start lg:gap-5">
          <TopicPanel studio={studio} />

          <section className="panel p-3 sm:p-5" aria-labelledby="preview-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
              <h2 id="preview-heading" className="text-[14px] font-black text-white">
                미리보기
              </h2>
              <span className="text-[10px] text-zinc-500">
                9:16 · {shorts.cuts.length}컷 · 약 {studio.totalSeconds.toFixed(1)}초
              </span>
            </div>

            <div className="mt-3 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:justify-center">
              <div className="flex justify-center">
                <ShortsPlayer shorts={shorts} playNonce={studio.playNonce} seekRequest={studio.seekRequest} />
              </div>
              <div className="mx-auto w-full max-w-[360px] sm:mx-0 sm:max-w-none sm:pt-4">
                <ExportBar shorts={shorts} notify={studio.notify} vertical />
                <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/25 p-3">
                  <p className="text-[10px] font-bold text-zinc-300">이렇게 씁니다</p>
                  <ol className="mt-1.5 space-y-1 text-[10px] leading-relaxed text-zinc-500">
                    <li>1. 주제를 한 줄 적고 톤을 고릅니다.</li>
                    <li>2. 만들기를 누르면 6컷이 바로 재생됩니다.</li>
                    <li>3. 마음에 안 드는 컷만 아래에서 고칩니다.</li>
                    <li>4. 대본·자막을 복사해 그대로 촬영합니다.</li>
                  </ol>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-3 sm:mt-5">
          <ShotStrip
            shorts={shorts}
            onChange={studio.updateCut}
            onBlur={studio.normalizeCut}
            onMove={studio.moveCut}
            onJump={studio.jumpTo}
            onReroll={studio.rerollScene}
            onRerollAll={studio.rerollAll}
          />
        </div>

        <p className="mx-auto mt-4 max-w-2xl text-center text-[10px] leading-relaxed text-zinc-600">
          대본은 AI가 없어도 내장 엔진으로 바로 나옵니다. 만든 대본은 브라우저에 자동 저장되고, 대본·자막(.srt)·컷별
          가이드로 바로 꺼낼 수 있습니다.
        </p>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex flex-col items-center gap-1.5 px-3">
        {studio.toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto max-w-[92vw] rounded-xl border px-3 py-2 text-[11px] shadow-2xl backdrop-blur ${
              toast.tone === 'error'
                ? 'border-red-400/30 bg-red-950/90 text-red-200'
                : toast.tone === 'warn'
                  ? 'border-amber-400/30 bg-amber-950/90 text-amber-200'
                  : 'border-white/15 bg-zinc-900/90 text-zinc-200'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
