import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

// Demo accounts and role permissions. There is no password: the sign-in screen just picks a person.
// The office (Ellie Whitcombe) sees every screen; an engineer sees only their own day (the engineer app).
// In a real installation the same roles sit behind the firm's own sign-in (email and password, Google or Microsoft).

export type Account = { role: 'office' } | { role: 'engineer'; eng: string };

/** The engineer the phone opens as in a live session: at 10:34 her next job (WR-48212, 11:00) is still to come */
export const LIVE_ENGINEER = 'gemma';

// Not stored under the "wr:" prefix, so "Reset demo data" does not sign anyone out
const KEY = 'wr-account';
const ENG = /^[a-z]{2,12}$/;

function parse(v: unknown): Account | null {
  if (!v || typeof v !== 'object') return null;
  const a = v as { role?: unknown; eng?: unknown };
  if (a.role === 'office') return { role: 'office' };
  if (a.role === 'engineer' && typeof a.eng === 'string' && ENG.test(a.eng)) return { role: 'engineer', eng: a.eng };
  return null;
}

/** ?as=office or ?as=<engineer>: the live-session link and the case page pick the account; the parameter is then removed */
function fromUrl(): Account | null {
  try {
    const u = new URL(location.href);
    const as = u.searchParams.get('as');
    if (!as) return null;
    u.searchParams.delete('as');
    history.replaceState(null, '', u.toString());
    if (as === 'office') return { role: 'office' };
    return ENG.test(as) ? { role: 'engineer', eng: as } : null;
  } catch {
    return null;
  }
}

function read(): Account | null {
  const q = fromUrl();
  if (q) return q;
  try {
    const saved = parse(JSON.parse(localStorage.getItem(KEY) || 'null'));
    if (saved) return saved;
    // First visit: straight into the office view, no sign-in gate. The welcome card offers the engineer account.
    // Someone who has been here before and signed out sees the sign-in screen instead.
    const prefs = JSON.parse(localStorage.getItem('wr-prefs') || '{}');
    return prefs && prefs.chosen === true ? null : { role: 'office' };
  } catch {
    return { role: 'office' };
  }
}

interface Ctx {
  account: Account | null;
  signIn: (a: Account) => void;
  signOut: () => void;
}
const C = createContext<Ctx | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(read);
  useEffect(() => {
    try {
      if (account) localStorage.setItem(KEY, JSON.stringify(account));
      else localStorage.removeItem(KEY);
    } catch {
      /* storage is blocked: the account lasts for this tab only */
    }
  }, [account]);
  const signIn = useCallback((a: Account) => setAccount(a), []);
  const signOut = useCallback(() => setAccount(null), []);
  return <C.Provider value={{ account, signIn, signOut }}>{children}</C.Provider>;
}

export function useAccount() {
  const c = useContext(C);
  if (!c) throw new Error('AccountProvider is missing');
  return c;
}

/** The engineer's id for an engineer account, otherwise null */
export const engineerOf = (a: Account | null) => (a?.role === 'engineer' ? a.eng : null);
