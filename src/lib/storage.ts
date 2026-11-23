// Değişiklikler tarayıcıda (localStorage) saklanır; sunucu yok.
// Erişim engelliyse (gizli pencere, kapalı site verisi) panel yine çalışır, yalnızca kaydetmez.
export const KEY_PREFIX = 'wr:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Demo verisini ilk hâline döndürür: yalnızca bu panelin anahtarlarını siler. */
export function resetDemo() {
  for (const store of [localStorage, sessionStorage]) {
    try {
      Object.keys(store)
        .filter((k) => k.startsWith(KEY_PREFIX))
        .forEach((k) => store.removeItem(k));
    } catch {
      /* depolama kapalı */
    }
  }
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = isMac ? '⌘' : 'Ctrl';
