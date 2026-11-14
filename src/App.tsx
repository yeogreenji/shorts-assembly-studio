import { useState } from 'react';
import { useStudio } from './hooks/useStudio';
import { Header } from './components/Header';
import { ScriptPanel } from './components/ScriptPanel';
import { StylePanel } from './components/StylePanel';
import { PreviewPanel } from './components/PreviewPanel';
import { GuideModal } from './components/GuideModal';

type Tab = 'script' | 'style' | 'preview';

const TABS: { id: Tab; label: string; step: string }[] = [
  { id: 'script', label: '대본·소스', step: '1' },
  { id: 'style', label: '음성·스타일', step: '2' },
  { id: 'preview', label: '미리보기·내보내기', step: '3' },
];

export default function App() {
  const studio = useStudio();
  const [tab, setTab] = useState<Tab>('script');
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col gap-2 p-2 sm:p-3">
      <Header studio={studio} onOpenGuide={() => setGuideOpen(true)} />

      <nav className="grid grid-cols-3 gap-1.5 xl:hidden">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-lg border px-2 py-2 text-[11px] font-semibold transition ${
              tab === item.id
                ? 'border-brand-400/60 bg-brand-500/15 text-brand-200'
                : 'border-white/10 text-zinc-400'
            }`}
          >
            <span className="mr-1 text-[10px] text-zinc-500">{item.step}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <main className="grid min-h-0 flex-1 gap-2 sm:gap-3 xl:grid-cols-[1.06fr_0.94fr_1fr]">
        <div className={`min-h-0 min-w-0 ${tab === 'script' ? 'flex' : 'hidden'} xl:flex`}>
          <ScriptPanel studio={studio} />
        </div>
        <div className={`min-h-0 min-w-0 ${tab === 'style' ? 'flex' : 'hidden'} xl:flex`}>
          <StylePanel studio={studio} />
        </div>
        <div className={`min-h-0 min-w-0 ${tab === 'preview' ? 'flex' : 'hidden'} xl:flex`}>
          <PreviewPanel studio={studio} />
        </div>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-1.5">
        {studio.toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto max-w-[92vw] rounded-xl border px-3 py-2 text-[11px] shadow-2xl backdrop-blur ${
              toast.tone === 'error'
                ? 'border-red-400/30 bg-red-950/85 text-red-200'
                : toast.tone === 'warn'
                  ? 'border-amber-400/30 bg-amber-950/85 text-amber-200'
                  : 'border-white/15 bg-zinc-900/90 text-zinc-200'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {guideOpen ? <GuideModal onClose={() => setGuideOpen(false)} /> : null}
    </div>
  );
}
