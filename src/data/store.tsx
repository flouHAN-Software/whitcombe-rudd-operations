import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Data, Invoice, Job, JobEvent, Part } from './types';
import { draftFor, nextInvoiceId } from './billing';
import { load, save } from '../lib/storage';
import { LiveConn, apply, changes, diff, newRoomId, roomFromUrl, setRoomInUrl, type Change, type LiveStatus } from '../lib/live';
import { clockStart, demoMinute, syncClock } from '../lib/clock';
import { LIVE_ENGINEER } from '../lib/account';
import { usePrefs } from '../lib/i18n';

// The data loads as a separate chunk (a real loading moment); changes are kept in localStorage.
const JOBS_KEY = 'jobs.v1';
const PARTS_KEY = 'parts.v1';
const INVOICES_KEY = 'invoices.v1';

type State = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; data: Data };

type NewEvent = Omit<JobEvent, 'by'> & { by?: string };

/** The latest change from another device (n grows with each event; at = demo minute) */
export interface LiveEvent extends Change { n: number; at: number }
/** Live-session checklist: things done on the other device and seen here */
export interface LiveChecks { way: boolean; finish: boolean; assign: boolean }
const NO_CHECKS: LiveChecks = { way: false, finish: false, assign: false };

interface Store {
  state: State;
  retry: () => void;
  saveFailed: boolean;
  updateJob: (id: string, patch: Partial<Job>, event?: NewEvent | NewEvent[]) => void;
  /** Undo: puts a job back the way it was */
  restoreJob: (job: Job) => void;
  /** Changes parts in bulk (ordering, booking into the depot, loading a van) */
  setParts: (fn: (parts: Part[]) => Part[]) => void;
  /** Changes invoices (sending, payments, reminders) */
  setInvoices: (fn: (invoices: Invoice[]) => Invoice[]) => void;
  /** Live session: devices in the same room see the same data at once (lib/live.ts) */
  live: { room: string | null; status: LiveStatus; peers: number; last: LiveEvent | null; checks: LiveChecks; start: () => string; stop: () => void };
}

const Ctx = createContext<Store | null>(null);

export const ME = 'Ellie Whitcombe';

const listOr = <T,>(saved: T[] | null, seed: T[]) => (Array.isArray(saved) && saved.length ? saved : seed);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [saveFailed, setSaveFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dirty = useRef(false);

  // live session
  const [room, setRoom] = useState<string | null>(() => roomFromUrl());
  const [status, setStatus] = useState<LiveStatus>('off');
  const [peers, setPeers] = useState(0);
  const [last, setLast] = useState<LiveEvent | null>(null);
  const [checks, setChecks] = useState<LiveChecks>(NO_CHECKS);
  const seq = useRef(0);
  const peersNow = useRef(0);
  peersNow.current = peers;
  const conn = useRef<LiveConn | null>(null);
  const latest = useRef<State>(state);
  latest.current = state;
  /** The last data the server knows about; local changes are compared with it and only the difference is sent */
  const synced = useRef<Data | null>(null);
  /** The next state change came from the server, so it is not sent back */
  const fromServer = useRef(false);

  useEffect(() => {
    let live = true;
    setState({ phase: 'loading' });
    import('./seed')
      .then(({ buildSeed }) => {
        if (!live) return;
        const seed = buildSeed();
        setState({
          phase: 'ready',
          data: {
            ...seed,
            jobs: listOr(load<Job[] | null>(JOBS_KEY, null), seed.jobs),
            parts: listOr(load<Part[] | null>(PARTS_KEY, null), seed.parts),
            invoices: listOr(load<Invoice[] | null>(INVOICES_KEY, null), seed.invoices)
          }
        });
      })
      .catch(() => live && setState({ phase: 'error' }));
    return () => {
      live = false;
    };
  }, [attempt]);

  // Join the live session once the data is ready
  const ready = state.phase === 'ready';
  useEffect(() => {
    if (!room || !ready) return;
    const c = new LiveConn(room, {
      onStatus: setStatus,
      onPeers: setPeers,
      onState: (data, t0, n) => {
        setPeers(n);
        const cur = latest.current;
        if (cur.phase !== 'ready') return;
        if (!data) {
          // Empty room: fill it with this device's data, and this device's demo clock
          synced.current = cur.data;
          c.send({ t: 'seed', data: { jobs: cur.data.jobs, parts: cur.data.parts, invoices: cur.data.invoices }, t0: clockStart() });
          return;
        }
        if (t0) syncClock(t0);
        const next = { ...cur.data, ...data };
        synced.current = next;
        fromServer.current = true;
        setState({ phase: 'ready', data: next });
      },
      onPatch: (p) => {
        const cur = latest.current;
        if (cur.phase === 'ready') note(changes(cur.data, apply(cur.data, p)), true);
        fromServer.current = true;
        setState((s) => {
          if (s.phase !== 'ready') return s;
          const next = apply(s.data, p);
          synced.current = next;
          return { phase: 'ready', data: next };
        });
      }
    });
    conn.current = c;
    c.open();
    return () => {
      c.close();
      conn.current = null;
      synced.current = null;
    };
  }, [room, ready]);

  // Send local changes to the room (but not the ones that came from the server)
  useEffect(() => {
    if (state.phase !== 'ready' || !conn.current) return;
    if (fromServer.current) { fromServer.current = false; return; }
    if (!synced.current) return;
    const p = diff(synced.current, state.data);
    if (!p) return;
    note(changes(synced.current, state.data), false);
    conn.current.send({ t: 'patch', up: p.up, del: p.del });
    synced.current = state.data;
  }, [state]);

  // Describe changes: the latest one from another device shows in the live bar, and the checklist ticks itself
  function note(ch: Change[], remote: boolean) {
    if (!ch.length) return;
    if (remote) setLast({ ...ch[ch.length - 1], n: ++seq.current, at: demoMinute() });
    const toEng = (x: Change) => (x.kind === 'assigned' || x.kind === 'moved') && x.eng === LIVE_ENGINEER;
    setChecks((c) => ({
      way: c.way || (remote && ch.some((x) => x.kind === 'en_route' || x.kind === 'on_site')),
      finish: c.finish || (remote && ch.some((x) => x.kind === 'done')),
      assign: c.assign || ch.some((x) => toEng(x) && (remote || peersNow.current > 1))
    }));
  }

  // A new room starts with an empty checklist and no last event
  useEffect(() => {
    setLast(null);
    setChecks(NO_CHECKS);
  }, [room]);

  const start = useCallback(() => {
    const id = newRoomId();
    setRoomInUrl(id);
    setRoom(id);
    return id;
  }, []);
  const stop = useCallback(() => {
    setRoomInUrl(null);
    setRoom(null);
    setPeers(0);
    // leaving the room brings back this device's own data
    setAttempt((a) => a + 1);
  }, []);

  // Save only after the user changed something; in a live session this device's own copy is left alone
  useEffect(() => {
    if (state.phase !== 'ready' || !dirty.current || room) return;
    const ok = save(JOBS_KEY, state.data.jobs) && save(PARTS_KEY, state.data.parts) && save(INVOICES_KEY, state.data.invoices);
    setSaveFailed(!ok);
  }, [state, room]);

  const updateJob = useCallback<Store['updateJob']>((id, patch, event) => {
    dirty.current = true;
    setState((s) => {
      if (s.phase !== 'ready') return s;
      const add = (event ? (Array.isArray(event) ? event : [event]) : []).map((e) => ({ by: ME, ...e }));
      let invoices = s.data.invoices;
      const jobs = s.data.jobs.map((j) => {
        if (j.id !== id) return j;
        const next = { ...j, ...patch, events: [...j.events, ...add] };
        // Finishing a job opens a draft invoice on its own (not for surveys and installs)
        if (patch.status === 'done' && j.status !== 'done' && !invoices.some((i) => i.job === id)) {
          const c = s.data.customers.find((x) => x.id === j.customer);
          const inv = c ? draftFor(next, c, s.data.parts, nextInvoiceId(invoices), add[0]?.at ?? `${j.date}T12:00`) : null;
          if (inv) invoices = [...invoices, inv];
        }
        return next;
      });
      return { phase: 'ready', data: { ...s.data, jobs, invoices } };
    });
  }, []);

  const restoreJob = useCallback<Store['restoreJob']>((job) => {
    dirty.current = true;
    setState((s) => (s.phase !== 'ready' ? s : { phase: 'ready', data: { ...s.data, jobs: s.data.jobs.map((j) => (j.id === job.id ? job : j)) } }));
  }, []);

  const setParts = useCallback<Store['setParts']>((fn) => {
    dirty.current = true;
    setState((s) => (s.phase !== 'ready' ? s : { phase: 'ready', data: { ...s.data, parts: fn(s.data.parts) } }));
  }, []);

  const setInvoices = useCallback<Store['setInvoices']>((fn) => {
    dirty.current = true;
    setState((s) => (s.phase !== 'ready' ? s : { phase: 'ready', data: { ...s.data, invoices: fn(s.data.invoices) } }));
  }, []);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  // Customers are not part of the live session (each device builds them from the seed), so their names can
  // follow the interface language here: a couple reads "Priya ve Tom Ashdown" in Turkish
  const { prefs } = usePrefs();
  const shown = useMemo<State>(() => {
    if (state.phase !== 'ready' || prefs.lang !== 'tr') return state;
    const customers = state.data.customers.map((c) => (c.kind === 'household' && c.name.includes(' and ') ? { ...c, name: c.name.replace(' and ', ' ve ') } : c));
    return { ...state, data: { ...state.data, customers } };
  }, [state, prefs.lang]);

  return <Ctx.Provider value={{ state: shown, retry, saveFailed, updateJob, restoreJob, setParts, setInvoices, live: { room, status, peers, last, checks, start, stop } }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('DataProvider is missing');
  return s;
}
