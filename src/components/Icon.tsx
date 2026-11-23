// Kendi çizimimiz: 16 px ızgara, 1,5 px çizgi, düz uç, köşeli birleşim.
// Az sayıda ikon; yalnızca menüde ve birkaç eylemde kullanılır.

const paths = {
  today: (
    <>
      <path d="M2.75 3.75h10.5v9.5H2.75z" />
      <path d="M2.75 6.25h10.5M5.75 1.75v3M10.25 1.75v3" />
      <path d="M8.75 8.75h2.5v2.5h-2.5z" fill="currentColor" stroke="none" />
    </>
  ),
  jobs: (
    <>
      <path d="M3.75 1.75h5.5l3 3v9.5h-8.5z" />
      <path d="M9.25 1.75v3h3M6 8.25h4.25M6 10.75h2.75" />
    </>
  ),
  dispatch: (
    <>
      <path d="M2 4h5.5M5.5 8h6M3 12h4" strokeWidth="2.5" />
      <path d="M10.75 1.5v13" strokeWidth="1.25" />
    </>
  ),
  stock: (
    <>
      <path d="M2.75 5 8 2.5 13.25 5v6.25L8 13.75 2.75 11.25z" />
      <path d="M2.75 5 8 7.5 13.25 5M8 7.5v6.25" />
    </>
  ),
  customers: (
    <>
      <path d="M2.75 7.25 8 2.75l5.25 4.5v6.5H2.75z" />
      <path d="M6.75 13.75v-3.5h2.5v3.5" />
    </>
  ),
  invoices: (
    <>
      <path d="M3.75 1.75h8.5v12.5l-1.42-1-1.41 1-1.42-1-1.42 1-1.41-1-1.42 1z" />
      <path d="M6 5.75h4M6 8.25h4M6 10.75h2" />
    </>
  ),
  reports: (
    <>
      <path d="M2.75 13.25h10.5" />
      <path d="M4.25 13.25V8.75M8 13.25V3.75M11.75 13.25V6.25" />
    </>
  ),
  live: (
    <>
      <path d="M1.75 3.25h8.5v6.5h-8.5z" />
      <path d="M4.25 12.75h3.5M6 9.75v3" />
      <path d="M11.75 6.25h2.5v7.5h-2.5z" />
    </>
  ),
  guide: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M6.3 6.3a1.8 1.8 0 1 1 2.55 1.65c-.55.25-.85.62-.85 1.2v.3" />
      <path d="M8 11.4v.35" />
    </>
  ),
  field: (
    <>
      <path d="M4.75 1.75h6.5v12.5h-6.5z" />
      <path d="M7 11.75h2" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3.5 3.5" />
    </>
  ),
  keyboard: (
    <>
      <path d="M1.75 4.25h12.5v7.5H1.75z" />
      <path d="M4.5 6.75h1M7.5 6.75h1M10.5 6.75h1M5 9.25h6" />
    </>
  ),
  more: (
    <>
      <path d="M3 8h.01M8 8h.01M13 8h.01" strokeWidth="2.5" strokeLinecap="square" />
    </>
  ),
  close: <path d="m3.75 3.75 8.5 8.5M12.25 3.75l-8.5 8.5" />,
  reset: (
    <>
      <path d="M3.25 8a4.75 4.75 0 1 0 1.4-3.36" />
      <path d="M3.25 2.25v3h3" />
    </>
  ),
  chevron: <path d="m6 3.75 4.25 4.25L6 12.25" />,
  sun: (
    <>
      <circle cx="8" cy="8" r="2.9" />
      <path d="M8 1.25v1.9M8 12.85v1.9M1.25 8h1.9M12.85 8h1.9M3.2 3.2l1.35 1.35M11.45 11.45l1.35 1.35M3.2 12.8l1.35-1.35M11.45 4.55l1.35-1.35" />
    </>
  ),
  moon: <path d="M13.25 9.9A5.6 5.6 0 0 1 6.1 2.75 5.6 5.6 0 1 0 13.25 9.9Z" />,
  enter: <path d="M12.75 3.25v5.5h-9M6.25 6.25l-2.5 2.5 2.5 2.5" />,
  check: <path d="m3.25 8.25 3 3 6.5-6.5" />,
  signout: (
    <>
      <path d="M6.25 2.75h-3.5v10.5h3.5" />
      <path d="M13.25 8h-7M10.25 5l3 3-3 3" />
    </>
  )
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="butt"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
