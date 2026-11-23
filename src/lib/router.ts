import { useSyncExternalStore } from 'react';
import { ROUTES, type RouteId } from './routes';

// Adres çubuğunda #/jobs gibi bir yol tutulur; statik sunucuda (GitHub Pages) yenilemede kaybolmaz.
const DEFAULT: RouteId = 'today';

function read(): { route: RouteId; rest: string[] } {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const hit = ROUTES.find((r) => r.id === parts[0]);
  return { route: hit ? hit.id : DEFAULT, rest: hit ? parts.slice(1) : [] };
}

let snapshot = read();
const listeners = new Set<() => void>();

window.addEventListener('hashchange', () => {
  snapshot = read();
  listeners.forEach((l) => l());
});

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useRoute() {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export function go(route: RouteId, ...rest: string[]) {
  const next = '#/' + [route, ...rest].join('/');
  if (location.hash !== next) location.hash = next;
}

/** Geçmişe yeni kayıt eklemeden adresi değiştirir (J/K ile satır gezerken) */
export function replace(route: RouteId, ...rest: string[]) {
  const next = '#/' + [route, ...rest].join('/');
  if (location.hash === next) return;
  history.replaceState(null, '', next);
  snapshot = read();
  listeners.forEach((l) => l());
}
