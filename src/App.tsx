import { useEffect, useMemo, useState } from 'react';
import { useShorts } from './hooks/useShorts';
import { useNarration } from './hooks/useNarration';
import { usePlan, limitsOf } from './lib/plan';
import { Header } from './components/Header';
import { TopicPanel } from './components/TopicPanel';
import { ProjectPanel } from './components/ProjectPanel';
import { ShortsPlayer } from './components/ShortsPlayer';
import { ShotStrip } from './components/ShotStrip';
import { Inspector, type InspectorTab } from './components/Inspector';
import { PricingDrawer } from './components/PricingDrawer';
import { Icon } from './components/Icon';
import { buildScenePlan } from './lib/motion/scene';
import { hydrateImages } from './lib/customArt';
import { previewVoice } from './lib/audio/previewVoice';
import { loadClips } from './lib/audio/tts';

type MobileView = 'script' | 'stage' | 'inspector';

export default function App() {
  const studio = useShorts();
  const { shorts } = studio;
  const plan = usePlan();
  const limits = useMemo(() => limitsOf(plan), [plan]);
  const narration = useNarration(shorts);
  const scenePlan = useMemo(() => buildScenePlan(shorts), [shorts]);
  const [tab, setTab] = useState<InspectorTab>('audio');
  const [view, setView] = useState<MobileView>('stage');
  const [pricingOpen, setPricingOpen] = useState(false);

  // 저장해 둔 내 이미지를 캔버스 창고에 올립니다(새로고침해도 내 사진 컷이 그대로).
  useEffect(() => {
    hydrateImages();
  }, []);

  // 대본이 바뀌면 6컷 음성을 미리 받아 둡니다(플레이 전에 도착해 있게).
  useEffect(() => {
    if (!shorts.audio.narration) return;
    void loadClips(narration.texts, narration.voice);
  }, [narration.texts, narration.voice, shorts.audio.narration]);

  // 음성이 서버에서 오지 못하면(정적 호스팅) 화면이 조용히 브라우저 음성으로 넘어가도록 한 번만 알립니다.
  useEffect(() => {
    if (narration.serverState === 'unavailable') {
      studio.notify('이 주소에는 음성 서버가 없어 미리보기만 브라우저 음성으로 재생합니다.', 'info');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narration.serverState]);

  return (
    <div className="min-h-dvh">
      <Header saved={studio.saved} plan={plan} server={studio.server} onPricing={() => setPricingOpen(true)} />

      <main className="mx-auto w-full max-w-[1560px] px-2.5 pb-8 pt-2.5 sm:px-4 sm:pt-4">
        {/* 모바일 — 한 번에 한 패널 */}
        <div className="seg mb-2.5 lg:hidden" role="group" aria-label="작업 영역">
          {(
            [
              { id: 'script', label: '대본' },
              { id: 'stage', label: '스테이지' },
              { id: 'inspector', label: '설정' },
            ] as { id: MobileView; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`mobile-tab-${item.id}`}
              className="seg-item"
              data-active={view === item.id}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid gap-2.5 lg:grid-cols-[minmax(260px,296px)_minmax(0,1fr)_minmax(300px,344px)] lg:items-start lg:gap-3">
          {/* 왼쪽 — 대본·프리셋 */}
          <div className={`${view === 'script' ? 'min-w-0 space-y-2.5' : 'hidden'} lg:block lg:space-y-3 lg:sticky lg:top-[68px] lg:max-h-[calc(100dvh-80px)] lg:overflow-y-auto lg:pr-0.5`}>
            <TopicPanel studio={studio} />
            <ProjectPanel studio={studio} />
          </div>

          {/* 가운데 — 스테이지 + 컷 */}
          <div className={`${view === 'stage' ? 'min-w-0 space-y-2.5' : 'hidden'} lg:block lg:space-y-3`}>
            <section className="surface" aria-labelledby="stage-heading">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
                <h1 id="stage-heading" className="flex items-center gap-1.5 text-[12px] font-semibold text-mist-200">
                  <Icon name="play" size={11} className="text-mist-500" />
                  스테이지
                </h1>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-mist-500" data-testid="project-summary">
                    9:16 · {shorts.cuts.length}컷 · 약 {studio.totalSeconds.toFixed(1)}초
                  </span>
                </div>
              </div>
              <div className="flex justify-center px-2 py-3 sm:px-3">
                <ShortsPlayer
                  shorts={shorts}
                  playNonce={studio.playNonce}
                  seekRequest={studio.seekRequest}
                  motion={studio.motion}
                  onMotion={studio.setMotion}
                  onAudio={studio.setAudio}
                  platformMark={limits.platformMark}
                />
              </div>
              <div className="border-t border-line-soft px-3 py-2">
                <p className="truncate text-[10px] text-mist-600">
                  {scenePlan.cuts[0]?.art.title ?? '일러스트'} 외 {Math.max(0, scenePlan.cuts.length - 1)}컷 · 컷마다 다른
                  일러스트와 카메라 무빙 · 자막·음성·브랜드가 영상에 그대로 구워집니다
                </p>
              </div>
            </section>

            <ShotStrip
              studio={studio}
              narration={narration}
              onVoice={(index) => void previewVoice(narration.texts[index] ?? '', { ...shorts.audio, voice: narration.voice })}
            />
          </div>

          {/* 오른쪽 — 인스펙터 */}
          <div className={`${view === 'inspector' ? 'min-w-0' : 'hidden'} lg:block lg:sticky lg:top-[68px] lg:max-h-[calc(100dvh-80px)] lg:overflow-y-auto lg:pr-0.5`}>
            <Inspector
              studio={studio}
              narration={narration}
              motion={studio.motion}
              tab={tab}
              onTab={setTab}
              onPricing={() => setPricingOpen(true)}
            />
          </div>
        </div>

        <p className="mx-auto mt-4 max-w-3xl text-center text-[10px] leading-relaxed text-mist-600">
          대본·이미지·영상은 브라우저 안에서만 처리되고 서버에 저장되지 않습니다(AI 대본을 켠 경우에만 주제 문장이,
          나레이션을 켠 경우에만 컷 자막이 음성 생성을 위해 전달됩니다). 그림은 웹툰·로맨스 판타지 일러스트 31장에서
          컷마다 새로 배정되고, 내 사진을 올린 컷은 얼굴은 그대로 두고 머리카락·옷자락·배경이 미세하게 흔들리는 2.5D
          워프로 움직입니다.
        </p>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex flex-col items-center gap-1.5 px-3">
        {studio.toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto max-w-[92vw] rounded-[8px] border px-3 py-2 text-[11px] shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] ${
              toast.tone === 'error'
                ? 'border-red-500/30 bg-[#1b1114] text-red-200'
                : toast.tone === 'warn'
                  ? 'border-amber-500/25 bg-[#191510] text-amber-200'
                  : 'border-line bg-ink-800 text-mist-200'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {pricingOpen ? <PricingDrawer onClose={() => setPricingOpen(false)} /> : null}
    </div>
  );
}
