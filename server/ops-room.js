// Operations dashboard demo: the live session (several devices see the same data at the same moment).
// One session = one Durable Object with SQLite storage. Devices connect over WebSocket.
//
// GET /api/ops/rooms/:id   (Upgrade: websocket)
//   :id is 8 characters (a-z, 0-9), made at random in the browser; anyone with the session link can join.
//
// Messages (JSON)
//   device → server { t: 'seed', data: { jobs, parts, invoices }, t0 }   first data and demo clock start, if the room is empty
//                   { t: 'patch', up: { jobs?: [...], ... }, del: { invoices?: ['INV-…'], ... } }   changed records, by id
//   server → device { t: 'state', data | null, t0, peers }   all of the data, on connect
//                   { t: 'patch', up, del }                 a change made on another device
//                   { t: 'peers', n }                       number of connected devices
//
// Limits: connections from the site's own pages only, 300 KB per message, 40 messages per 10 seconds per device,
// 12 devices per room, three known collections and records with an id. A room nobody joins for 24 hours is deleted.
// The data is made-up demo data; no personal data is kept.
import { DurableObject } from 'cloudflare:workers';

const ROOM = /^[a-z0-9]{8}$/;
const KEYS = ['jobs', 'parts', 'invoices'];
const MAX_MSG = 300_000;
const MAX_ITEMS = 400;
const MAX_PEERS = 12;
const RATE_WINDOW = 10_000;
const RATE_MAX = 40;
const IDLE_MS = 24 * 60 * 60 * 1000;

/** Requests to /api/ops/… (routed here by the Worker's entry file) */
export async function ops(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'ops', 'rooms', id]
  if (parts[2] !== 'rooms' || parts.length !== 4 || !ROOM.test(parts[3])) return json({ ok: false, error: 'not_found' }, 404);
  if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return json({ ok: false, error: 'upgrade' }, 426);
  // Browsers send an Origin header with the WebSocket request, so other sites cannot connect
  if (request.headers.get('Origin') !== url.origin) return json({ ok: false, error: 'origin' }, 403);
  const stub = env.OPS_ROOM.get(env.OPS_ROOM.idFromName(parts[3]));
  return stub.fetch(request);
}

export class OpsRoom extends DurableObject {
  async fetch() {
    const peers = this.ctx.getWebSockets();
    if (peers.length >= MAX_PEERS) return new Response('full', { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ n: 0, w: Date.now() });
    const data = await this.load();
    const t0 = (await this.ctx.storage.get('t0')) ?? null;
    server.send(JSON.stringify({ t: 'state', data, t0, peers: peers.length + 1 }));
    this.broadcast({ t: 'peers', n: peers.length + 1 }, server);
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > MAX_MSG) return ws.close(1009, 'size');
    const a = ws.deserializeAttachment() || { n: 0, w: Date.now() };
    const now = Date.now();
    if (now - a.w > RATE_WINDOW) { a.n = 0; a.w = now; }
    a.n++;
    ws.serializeAttachment(a);
    if (a.n > RATE_MAX) return ws.close(1008, 'rate');

    let m;
    try { m = JSON.parse(msg); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'seed') {
      const cur = await this.load();
      if (cur) {
        // Another device has already filled the room: its data wins
        ws.send(JSON.stringify({ t: 'state', data: cur, t0: (await this.ctx.storage.get('t0')) ?? null, peers: this.ctx.getWebSockets().length }));
        return;
      }
      const data = {};
      for (const k of KEYS) {
        const list = cleanList(m.data?.[k]);
        if (!list) return ws.close(1007, 'data');
        data[k] = list;
      }
      const t0 = Number.isFinite(m.t0) && Math.abs(now - m.t0) < IDLE_MS ? m.t0 : now;
      await this.ctx.storage.put({ jobs: data.jobs, parts: data.parts, invoices: data.invoices, t0 });
      this.broadcast({ t: 'state', data, t0, peers: this.ctx.getWebSockets().length }, ws);
    } else if (m.t === 'patch') {
      const data = await this.load();
      if (!data) return;
      const up = {}, del = {};
      for (const k of KEYS) {
        const u = m.up?.[k] === undefined ? [] : cleanList(m.up[k]);
        const d = m.del?.[k] === undefined ? [] : cleanIds(m.del[k]);
        if (!u || !d) return ws.close(1007, 'data');
        if (!u.length && !d.length) continue;
        const byId = new Map(data[k].map((x) => [x.id, x]));
        for (const x of u) byId.set(x.id, x);
        for (const id of d) byId.delete(id);
        if (byId.size > MAX_ITEMS) return ws.close(1007, 'items');
        data[k] = [...byId.values()];
        await this.ctx.storage.put(k, data[k]);
        if (u.length) up[k] = u;
        if (d.length) del[k] = d;
      }
      this.broadcast({ t: 'patch', up, del }, ws);
    }
    await this.ctx.storage.setAlarm(now + IDLE_MS);
  }

  async webSocketClose(ws) {
    const n = this.ctx.getWebSockets().filter((x) => x !== ws).length;
    this.broadcast({ t: 'peers', n }, ws);
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    if (this.ctx.getWebSockets().length) {
      await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
      return;
    }
    await this.ctx.storage.deleteAll();
  }

  async load() {
    const got = await this.ctx.storage.get(KEYS);
    if (!got.get('jobs')) return null;
    return { jobs: got.get('jobs'), parts: got.get('parts') ?? [], invoices: got.get('invoices') ?? [] };
  }

  broadcast(obj, except) {
    const s = JSON.stringify(obj);
    for (const w of this.ctx.getWebSockets()) {
      if (w === except) continue;
      try { w.send(s); } catch { /* connection already gone */ }
    }
  }
}

/** A list of plain objects that all have an id, with a length limit */
function cleanList(v) {
  if (!Array.isArray(v) || v.length > MAX_ITEMS) return null;
  for (const x of v) {
    if (!x || typeof x !== 'object' || Array.isArray(x) || typeof x.id !== 'string' || x.id.length > 40) return null;
  }
  return v;
}

function cleanIds(v) {
  if (!Array.isArray(v) || v.length > MAX_ITEMS) return null;
  return v.every((x) => typeof x === 'string' && x.length <= 40) ? v : null;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
