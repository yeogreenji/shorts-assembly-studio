import type { Studio } from '../hooks/useShorts';
import type { NarrationView } from '../hooks/useNarration';
import type { MotionLevel } from '../lib/motion/stage';
import { AudioPanel } from './AudioPanel';
import { CaptionBrandPanel } from './CaptionBrandPanel';
import { ExportPanel } from './ExportPanel';
import { Icon, type IconName } from './Icon';

export type InspectorTab = 'audio' | 'caption' | 'export';

const TABS: { id: InspectorTab; label: string; icon: IconName }[] = [
  { id: 'audio', label: '오디오 · TTS', icon: 'mic' },
  { id: 'caption', label: '자막 · 브랜드', icon: 'file' },
  { id: 'export', label: '내보내기', icon: 'download' },
];

/** 오른쪽 인스펙터 — 오디오/TTS · 자막/브랜드 · 내보내기 세 탭. */
export function Inspector({
  studio,
  narration,
  motion,
  tab,
  onTab,
  onPricing,
}: {
  studio: Studio;
  narration: NarrationView;
  motion: MotionLevel;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  onPricing: () => void;
}) {
  return (
    <section className="surface" aria-label="인스펙터">
      <div className="flex items-center gap-4 border-b border-line-soft px-3">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            data-active={tab === item.id}
            data-testid={`inspector-tab-${item.id}`}
            onClick={() => onTab(item.id)}
            className="tab flex items-center gap-1"
          >
            <Icon name={item.icon} size={12} className={tab === item.id ? 'text-mist-300' : 'text-mist-600'} />
            {item.label}
          </button>
        ))}
      </div>

      <div className="p-3" role="tabpanel">
        {tab === 'audio' ? <AudioPanel studio={studio} narration={narration} onPricing={onPricing} /> : null}
        {tab === 'caption' ? <CaptionBrandPanel studio={studio} /> : null}
        {tab === 'export' ? <ExportPanel studio={studio} narration={narration} motion={motion} onPricing={onPricing} /> : null}
      </div>
    </section>
  );
}
