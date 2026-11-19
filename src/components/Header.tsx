export function Header({ saved }: { saved: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#07060c]/92">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2.5 px-4 py-2.5 sm:px-6">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[13px] bg-gradient-to-br from-brand-300 via-brand-500 to-[#8b5cf6] shadow-[0_12px_26px_-14px_rgba(240,86,159,0.9)]">
          <span className="text-[15px]" aria-hidden="true">
            🎬
          </span>
          <span className="absolute inset-0 rounded-[13px] ring-1 ring-inset ring-white/25" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="display flex items-center gap-1.5 text-[14px] font-black text-white">
            숏컷 스튜디오
            <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-[1px] text-[9px] font-bold tracking-normal text-zinc-400 sm:inline">
              v6
            </span>
          </p>
          <p className="hidden text-[9px] uppercase tracking-[0.2em] text-zinc-500 sm:block">
            Webtoon · Romance Art Shorts
          </p>
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
