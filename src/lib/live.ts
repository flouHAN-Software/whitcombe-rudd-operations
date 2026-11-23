// Canlı oturum: aynı oturumdaki cihazlar (ör. bilgisayarda ofis, telefonda teknisyen) aynı veriyi anlık görür.
// Sunucu: worker/ops-room.js (Cloudflare Durable Object, SQLite). Bağlantı: /api/ops/rooms/<id> (WebSocket).
// Yalnızca değişen kayıtlar gönderilir (id ile); silinenler ayrıca bildirilir.
import type { Data } from '../data/types';

export type Coll = 'jobs' | 'parts' | 'invoices';
export const COLLS: Coll[] = ['jobs', 'parts', 'invoices'];
type Item = { id: string };
export interface Patch {
  up: Partial<Record<Coll, Item[]>>;
  del: Partial<Record<Coll, string[]>>;
}
export type LiveStatus = 'off' | 'connecting' | 'live' | 'offline';

const ROOM = /^[a-z0-9]{8}$/;

/** Adresteki ?room=… (yoksa null) */
export function roomFromUrl(): string | null {
  try {
    const r = new URLSearchParams(location.search).get('room');
    return r && ROOM.test(r) ? r : null;
  } catch {
    return null;
  }
}

export function newRoomId() {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  const b = crypto.getRandomValues(new Uint8Array(8));
  return [...b].map((x) => abc[x % abc.length]).join('');
}

/** Oturumu adrese yazar (sayfa yeniden yüklenmez); null verilirse oturumdan çıkar */
export function setRoomInUrl(room: string | null) {
  const u = new URL(location.href);
  if (room) u.searchParams.set('room', room);
  else u.searchParams.delete('room');
  history.replaceState(null, '', u.toString());
}

/** Önceki ve sonraki veri arasındaki fark (değişmeyen kayıtların nesnesi aynı kalır) */
export function diff(prev: Data, next: Data): Patch | null {
  const p: Patch = { up: {}, del: {} };
  let any = false;
  for (const k of COLLS) {
    const a = prev[k] as unknown as Item[];
    const b = next[k] as unknown as Item[];
    if (a === b) continue;
    const old = new Map(a.map((x) => [x.id, x]));
    const up = b.filter((x) => old.get(x.id) !== x);
    const ids = new Set(b.map((x) => x.id));
    const del = a.filter((x) => !ids.has(x.id)).map((x) => x.id);
    if (up.length) { p.up[k] = up; any = true; }
    if (del.length) { p.del[k] = del; any = true; }
  }
  return any ? p : null;
}

/** Gelen farkı veriye uygular */
export function apply(data: Data, p: Patch): Data {
  const out = { ...data } as Data;
  for (const k of COLLS) {
    const up = p.up?.[k] ?? [];
    const del = p.del?.[k] ?? [];
    if (!up.length && !del.length) continue;
    const byId = new Map((data[k] as unknown as Item[]).map((x) => [x.id, x]));
    for (const x of up) byId.set(x.id, x);
    for (const id of del) byId.delete(id);
    (out as unknown as Record<Coll, Item[]>)[k] = [...byId.values()];
  }
  return out;
}

export interface LiveHandlers {
  onState: (data: Pick<Data, Coll> | null, t0: number | null, peers: number) => void;
  onPatch: (p: Patch) => void;
  onPeers: (n: number) => void;
  onStatus: (s: LiveStatus) => void;
}

/** WebSocket bağlantısı; kopunca artan aralıklarla yeniden bağlanır */
export class LiveConn {
  private ws: WebSocket | null = null;
  private tries = 0;
  private closed = false;
  private timer = 0;
  private room: string;
  private h: LiveHandlers;

  constructor(room: string, h: LiveHandlers) {
    this.room = room;
    this.h = h;
  }

  open() {
    this.closed = false;
    this.h.onStatus('connecting');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${proto}//${location.host}/api/ops/rooms/${this.room}`);
    } catch {
      this.h.onStatus('offline');
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.tries = 0;
      this.h.onStatus('live');
    };
    ws.onmessage = (e) => {
      let m: { t: string; data?: Pick<Data, Coll> | null; t0?: number | null; peers?: number; n?: number; up?: Patch['up']; del?: Patch['del'] };
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.t === 'state') this.h.onState(m.data ?? null, m.t0 ?? null, m.peers ?? 1);
      else if (m.t === 'patch') this.h.onPatch({ up: m.up ?? {}, del: m.del ?? {} });
      else if (m.t === 'peers') this.h.onPeers(m.n ?? 1);
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.closed) return;
      this.h.onStatus('offline');
      const wait = Math.min(15000, 1000 * 2 ** this.tries++);
      this.timer = window.setTimeout(() => this.open(), wait);
    };
  }

  send(obj: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
    this.h.onStatus('off');
  }
}

/** Diğer cihazdan gelen, ekranda anlatılmaya değer değişiklik (canlı şerit, deneme listesi, telefondaki bildirim) */
export type ChangeKind = 'en_route' | 'on_site' | 'done' | 'assigned' | 'moved' | 'other';
export interface Change {
  kind: ChangeKind;
  job: string;
  eng: string | null;
  /** İşe eklenen son kaydı yazan kişi (teknisyen ya da ofis) */
  by: string | null;
}

/** İki veri arasındaki iş değişikliklerini anlatılabilir olaylara çevirir */
export function changes(prev: Data, next: Data): Change[] {
  if (prev.jobs === next.jobs) return [];
  const old = new Map(prev.jobs.map((j) => [j.id, j]));
  const out: Change[] = [];
  for (const j of next.jobs) {
    const o = old.get(j.id);
    if (!o || o === j) continue;
    const by = j.events.length > o.events.length ? j.events[j.events.length - 1].by : null;
    const base = { job: j.id, eng: j.engineer, by };
    if (j.status !== o.status && (j.status === 'en_route' || j.status === 'on_site' || j.status === 'done')) out.push({ kind: j.status, ...base });
    else if (j.engineer && j.engineer !== o.engineer) out.push({ kind: 'assigned', ...base });
    else if (j.engineer && (j.plan?.[0] !== o.plan?.[0] || j.date !== o.date)) out.push({ kind: 'moved', ...base });
    else if (j.status !== o.status) out.push({ kind: 'other', ...base });
  }
  return out;
}
