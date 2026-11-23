import type { ReactElement } from 'react';
import type { StatusView, Tone } from '../data/derive';

// Durum = biçim + renk + yazı. Renk körü biri de biçimden ayırt eder.
const GLYPH: Record<Tone, ReactElement> = {
  late: <path d="M5 0 10 5 5 10 0 5Z" fill="currentColor" />,
  over: <path d="M5 .5 9.7 9.3H.3Z" fill="currentColor" />,
  behind: <path d="M5 1.6 8.8 8.6H1.2Z" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  live: <path d="M1 1 9 5 1 9 3 5Z" fill="currentColor" />,
  onsite: <circle cx="5" cy="5" r="4" fill="currentColor" />,
  booked: <circle cx="5" cy="5" r="3.9" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  tray: <circle cx="5" cy="5" r="3.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.6" />,
  parts: <rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.6" />,
  hold: <path d="M2.5 1.5v7M7.5 1.5v7" stroke="currentColor" strokeWidth="2" />,
  half: <><circle cx="5" cy="5" r="3.9" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M5 1.1a3.9 3.9 0 0 1 0 7.8Z" fill="currentColor" /></>,
  done: <path d="M1 5.2 3.8 8 9 2" fill="none" stroke="currentColor" strokeWidth="1.8" />
};

export function StatusGlyph({ tone }: { tone: Tone }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="st-glyph">
      {GLYPH[tone]}
    </svg>
  );
}

export function Status({ view, compact = false }: { view: StatusView; compact?: boolean }) {
  return (
    <span className={'st st-' + view.tone}>
      <StatusGlyph tone={view.tone} />
      <span className="st-label">{view.label}</span>
      {view.sub && !compact && <span className="st-sub">{view.sub}</span>}
    </span>
  );
}
