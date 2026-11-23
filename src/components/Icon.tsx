import type { SVGProps } from 'react';

/**
 * 아이콘 — 이모지 대신 쓰는 1.6px 스트로크 라인 아이콘.
 * 외부 아이콘 패키지를 넣지 않고 필요한 모양만 path로 정의해 번들 크기를 그대로 둡니다.
 */

const PATHS = {
  film: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M7.5 3v18M16.5 3v18" />
      <path d="M3 8h4.5M3 16h4.5M16.5 8H21M16.5 16H21" />
    </>
  ),
  play: <path d="M7 4.5v15l13-7.5L7 4.5Z" />,
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1.2" />
      <rect x="14" y="4" width="4" height="16" rx="1.2" />
    </>
  ),
  restart: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3 3.5V9h5.5" />
    </>
  ),
  volume: (
    <>
      <path d="M11 5 6.5 8.7H3.5v6.6h3L11 19V5Z" />
      <path d="M15.2 8.8a4.6 4.6 0 0 1 0 6.4M18 6.2a8.4 8.4 0 0 1 0 11.6" />
    </>
  ),
  mute: (
    <>
      <path d="M11 5 6.5 8.7H3.5v6.6h3L11 19V5Z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5" />
    </>
  ),
  download: (
    <>
      <path d="M20.5 15.5v3.2a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-3.2" />
      <path d="M7.5 10.5 12 15l4.5-4.5M12 15V3" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2.2" />
      <path d="M5.5 15H4.8A1.8 1.8 0 0 1 3 13.2V4.8A1.8 1.8 0 0 1 4.8 3h8.4A1.8 1.8 0 0 1 15 4.8V5.5" />
    </>
  ),
  file: (
    <>
      <path d="M14 2.5H6.8A1.8 1.8 0 0 0 5 4.3v15.4a1.8 1.8 0 0 0 1.8 1.8h10.4a1.8 1.8 0 0 0 1.8-1.8V7.5L14 2.5Z" />
      <path d="M13.8 2.5v5.2h5.2M8.5 13h7M8.5 17h5" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h12M9 12h12M9 18h12" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeLinecap="round" strokeWidth="2.4" />
    </>
  ),
  upload: (
    <>
      <path d="M20.5 15.5v3.2a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-3.2" />
      <path d="M7.5 8 12 3.5 16.5 8M12 3.5V15" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3.5" width="18" height="17" rx="2.4" />
      <circle cx="8.6" cy="9.2" r="1.5" />
      <path d="M20.5 15.5 16 11 5 20.5" />
    </>
  ),
  sparkles: (
    <>
      <path d="M11.5 3.2 13 7.6l4.4 1.5L13 10.6 11.5 15 10 10.6 5.6 9.1 10 7.6 11.5 3.2Z" />
      <path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </>
  ),
  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevron: <path d="M6 9.5 12 15.5 18 9.5" />,
  chevronRight: <path d="M9.5 6 15.5 12 9.5 18" />,
  mic: (
    <>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5.5l11.5-2v12.2" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17.5" cy="15.7" r="3" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 21v-6.5M4 10.5V3M12 21v-9M12 8V3M20 21v-4.5M20 12.5V3" />
      <path d="M1.5 14h5M9.5 8h5M17.5 16.5h5" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.4" />
      <path d="M2.5 10h19M6.5 15h3" />
    </>
  ),
  users: (
    <>
      <path d="M16.5 20.5v-1.8a4 4 0 0 0-4-4h-5a4 4 0 0 0-4 4v1.8" />
      <circle cx="10" cy="7.2" r="3.7" />
      <path d="M20.5 20.5v-1.8a4 4 0 0 0-3-3.85M15.5 3.7a3.7 3.7 0 0 1 0 7" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M4.5 12h15M13 5.5 19.5 12 13 18.5" />
    </>
  ),
  arrowLeft: (
    <>
      <path d="M19.5 12h-15M11 18.5 4.5 12 11 5.5" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="3.5" width="19" height="13.5" rx="2" />
      <path d="M8.5 21h7M12 17v4" />
    </>
  ),
  bolt: <path d="M13.5 2.5 4 13.5h7l-.5 8L20 10.5h-7l.5-8Z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M12 16.5V11M12 7.8h.01" strokeLinecap="round" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M12 6.8V12l3.6 2.2" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  wave: (
    <>
      <path d="M3 12h2.2M8 7v10M12 4.5v15M16 8.5v7M20 11h1" strokeLinecap="round" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="2.6" />
      <circle cx="6" cy="18" r="2.6" />
      <path d="M8.2 7.8 20 18M20 6 8.2 16.2" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 16,
  className,
  ...rest
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

/** 헤더 로고 — 재생 삼각형이 새겨진 필름 프레임. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[7px] border border-line bg-ink-750 text-mist-100"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3.2" strokeLinecap="round" />
        <path d="M10 8.6v6.8l5.4-3.4L10 8.6Z" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** 작은 상태 점 + 라벨. */
export function StatusDot({ tone = 'muted' }: { tone?: 'live' | 'warn' | 'muted' }) {
  const color = tone === 'live' ? 'bg-mint-400' : tone === 'warn' ? 'bg-amber-400' : 'bg-mist-600';
  return <span className={`dot ${color}`} aria-hidden="true" />;
}
