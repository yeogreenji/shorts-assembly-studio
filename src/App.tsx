import { useMemo } from 'react';
import { useShorts } from './hooks/useShorts';
import { Header } from './components/Header';
import { TopicPanel } from './components/TopicPanel';
import { ShortsPlayer } from './components/ShortsPlayer';
import { ShotStrip } from './components/ShotStrip';
import { ExportBar } from './components/ExportBar';
import { buildScenePlan } from './lib/motion/scene';

export default function App() {
  const studio = useShorts();
  const { shorts } = studio;
  const plan = useMemo(() => buildScenePlan(shorts), [shorts]);
  const genres = new Set(plan.cuts.map((cut) => cut.art.genre));

  return (
    <div className="min-h-dvh pb-8">
      <Header saved={studio.saved} />

      <main className="mx-auto w-full max-w-6xl px-3 pb-8 pt-3 sm:px-6 sm:pt-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start lg:gap-5">
          <TopicPanel studio={studio} />

          <section className="panel p-3 sm:p-5" aria-labelledby="preview-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
              <h2 id="preview-heading" className="display text-[15px] font-extrabold text-white">
                미리보기
              </h2>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-[2px] text-[10px] text-zinc-400">
                9:16 · {shorts.cuts.length}컷 · 약 {studio.totalSeconds.toFixed(1)}초
              </span>
            </div>

            <div className="mt-3 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:justify-center">
              <div className="flex justify-center">
                <ShortsPlayer
                  shorts={shorts}
                  playNonce={studio.playNonce}
                  seekRequest={studio.seekRequest}
                  motion={studio.motion}
                  onMotion={studio.setMotion}
                />
              </div>
              <div className="mx-auto w-full max-w-[360px] sm:mx-0 sm:max-w-none sm:pt-4">
                <ExportBar shorts={shorts} notify={studio.notify} motion={studio.motion} vertical />
                <div className="mt-3 rounded-2xl border border-white/[0.07] bg-black/25 p-3">
                  <p className="text-[10px] font-bold text-zinc-300">이 컷들의 아트</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
                    {plan.cuts
                      .map((cut) => cut.art.title)
                      .slice(0, 3)
                      .join(' · ')}
                    {plan.cuts.length > 3 ? ' …' : ''}
                  </p>
                  <p className="mt-1.5 text-[10px] text-zinc-600">
                    장르 {genres.size}종 · 컷마다 다른 일러스트와 카메라 무빙
                  </p>
                </div>
                <div className="mt-3 rounded-2xl border border-white/[0.07] bg-black/25 p-3">
                  <p className="text-[10px] font-bold text-zinc-300">이렇게 씁니다</p>
                  <ol className="mt-1.5 space-y-1 text-[10px] leading-relaxed text-zinc-500">
                    <li>1. 주제를 한 줄 적고 톤을 고릅니다.</li>
                    <li>2. 만들기를 누르면 웹툰 일러스트 6컷이 바로 재생됩니다.</li>
                    <li>3. 마음에 안 드는 컷만 아래에서 고칩니다.</li>
                    <li>4. 영상(.webm) 또는 대본으로 그대로 꺼냅니다.</li>
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
          />
        </div>

        <p className="mx-auto mt-4 max-w-2xl text-center text-[10px] leading-relaxed text-zinc-600">
          그림은 웹툰·로맨스 판타지 스타일 일러스트 31장에서 컷마다 새로 배정됩니다. 그림은 얼굴은 그대로 두고
          머리카락·옷자락·배경이 미세하게 흔들리는 2.5D 워프로 움직이고, 자막·배너까지 캔버스에 구워지므로 저장한
          720×1280 영상이 미리보기와 같습니다.
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
