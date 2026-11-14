import type { ReactNode } from 'react';

export function Panel({
  step,
  title,
  hint,
  right,
  children,
  className = '',
}: {
  step: string;
  title: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel flex min-h-0 min-w-0 flex-col ${className}`}>
      <header className="flex items-start justify-between gap-3 border-b border-white/5 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-brand-400">
              {step}
            </span>
            <h2 className="truncate text-sm font-semibold text-zinc-100">{title}</h2>
          </div>
          {hint ? <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{hint}</p> : null}
        </div>
        {right}
      </header>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">{children}</div>
    </section>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{children}</h3>
      {right}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = 'ghost',
  size = 'md',
  disabled,
  title,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'soft' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';
  const sizes = size === 'sm' ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs';
  const variants: Record<string, string> = {
    primary:
      'bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-600/25 hover:from-brand-400 hover:to-brand-500',
    soft: 'bg-white/10 text-zinc-100 hover:bg-white/15',
    ghost: 'border border-white/10 text-zinc-300 hover:border-white/25 hover:text-white',
    danger: 'border border-red-500/30 text-red-300 hover:bg-red-500/10',
  };
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
        active
          ? 'border-brand-400/60 bg-brand-500/20 text-brand-300'
          : 'border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.05,
  onChange,
  display,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  display?: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs text-zinc-300">{label}</span>
        <span className="text-[11px] font-mono text-brand-300">{display ?? value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint ? <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">{hint}</p> : null}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-zinc-400">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[10px] text-zinc-600">{hint}</span> : null}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg border border-white/10 px-2.5 py-2 text-xs text-zinc-300 transition hover:border-white/20"
    >
      <span>{label}</span>
      <span
        className={`relative h-4 w-8 rounded-full transition ${checked ? 'bg-brand-500' : 'bg-zinc-700'}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
            checked ? 'left-4' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}
