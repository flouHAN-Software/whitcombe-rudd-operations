import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

// Demo hesapları ve rol yetkisi. Parola yok: giriş ekranında kişi seçilir.
// Ofis (Ellie Whitcombe) bütün ekranları görür; teknisyen yalnızca kendi gününü (teknisyen uygulaması).
// Gerçek bir kurulumda aynı roller firmanın kendi girişine (e-posta + parola, Google ya da Microsoft) bağlanır.

export type Account = { role: 'office' } | { role: 'engineer'; eng: string };

/** Canlı oturumda telefonun açıldığı teknisyen: 10:34'te sıradaki işi (WR-48212, 11:00) bekliyor */
export const LIVE_ENGINEER = 'gemma';

// "wr:" önekiyle saklanmaz: "Demo verisini sıfırla" oturumu kapatmasın
const KEY = 'wr-account';
const ENG = /^[a-z]{2,12}$/;

function parse(v: unknown): Account | null {
  if (!v || typeof v !== 'object') return null;
  const a = v as { role?: unknown; eng?: unknown };
  if (a.role === 'office') return { role: 'office' };
  if (a.role === 'engineer' && typeof a.eng === 'string' && ENG.test(a.eng)) return { role: 'engineer', eng: a.eng };
  return null;
}

/** ?as=office ya da ?as=<teknisyen>: canlı oturum bağlantısı ve vaka sayfası hesabı belirler; adresten silinir */
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
    return parse(JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch {
    return null;
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
      /* depolama kapalı: hesap yalnızca bu sekmede geçerli */
    }
  }, [account]);
  const signIn = useCallback((a: Account) => setAccount(a), []);
  const signOut = useCallback(() => setAccount(null), []);
  return <C.Provider value={{ account, signIn, signOut }}>{children}</C.Provider>;
}

export function useAccount() {
  const c = useContext(C);
  if (!c) throw new Error('AccountProvider eksik');
  return c;
}

/** Teknisyen hesabıysa teknisyenin kimliği, değilse null */
export const engineerOf = (a: Account | null) => (a?.role === 'engineer' ? a.eng : null);
