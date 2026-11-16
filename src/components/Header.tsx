export function Header({ saved }: { saved: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2.5 px-4 py-2.5 sm:px-6">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-600/30">
          <span className="text-[13px]" aria-hidden="true">
            🎬
          </span>
        </div>
        <div className="min-w-0 leading-tight">
          <p className="text-[13px] font-black tracking-tight text-white">숏컷 스튜디오</p>
          <p className="hidden text-[9px] uppercase tracking-[0.18em] text-zinc-500 sm:block">ShortCut Studio</p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-500" data-testid="save-state">
          <span
            className={`h-1.5 w-1.5 rounded-full ${saved ? 'bg-emerald-400' : 'bg-amber-400'}`}
            aria-hidden="true"
          />
          {saved ? '자동 저장됨' : '저장 중…'}
        </span>
      </div>
    </header>
  );
}
