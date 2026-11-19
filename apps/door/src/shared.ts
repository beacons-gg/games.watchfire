import { requestOf } from "./request.ts";

/**
 * One read for the whole door. Every session reads the world every 30 seconds (discovery, then
 * each fire): with many players on, those are mostly the same GETs. This shares them: a read
 * answered in the last `keepMs` is answered again from memory, and sessions asking at once wait on
 * one request.
 *
 * - Only those hot reads are shared: discovery and single rooms. Anything else (profiles, access,
 *   descriptors, pings) goes straight through, so nothing that's read-then-written goes stale.
 * - A move (`POST /rooms/:id/ops`) forgets that room and discovery, before and after it lands,
 *   so its player sees it on the next read; lighting (`POST /rooms`) forgets discovery.
 * - `fresh` is for a read that must see the latest (a fire right after the live socket said it
 *   changed): it never answers from before the call, but everyone watching that fire, told at the
 *   same moment, still shares one request, and its answer is kept for the next ordinary read.
 * - Only successful answers are kept; a failure is every caller's own, and the next read tries again.
 */
export function sharedReads(inner: typeof fetch = fetch, keepMs = 10_000, timeoutMs = 15_000): { fetch: typeof fetch; fresh: typeof fetch } {
  // origin -> path+query -> the answer
  const kept = new Map<string, Map<string, Entry>>();
  const keptAt = (origin: string) => kept.get(origin) ?? kept.set(origin, new Map()).get(origin)!;

  /** Forget what a write changes: the room it moved (if any) and discovery. */
  const forget = (origin: string, room: string | null) => {
    const at = keptAt(origin);
    for (const key of at.keys()) if (key === room || DISCOVERY.test(key.split("?")[0]!)) at.delete(key);
  };

  const start = (url: URL, init: RequestInit | undefined, fresh: boolean): Entry => {
    const at = keptAt(url.origin);
    const key = url.pathname + url.search;
    if (at.size > 2000) for (const [k, e] of at) if (e.until <= Date.now()) at.delete(k);
    // The shared request has its own timeout: it mustn't die with whichever caller started it.
    const answer = inner(url.href, { ...init, signal: AbortSignal.timeout(timeoutMs) }).then(toAnswer);
    const entry: Entry = { started: Date.now(), until: Date.now() + keepMs, fresh, answer };
    at.set(key, entry);
    // Keep only successes; drop this entry (not a newer one) on failure.
    const drop = () => at.get(key) === entry && at.delete(key);
    answer.then((a) => (a.status < 200 || a.status > 299) && drop(), drop);
    return entry;
  };

  const shared = (fresh: boolean) =>
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      const { url, read, method } = requestOf(input, init);
      const path = url.pathname;
      if (method === "HEAD") return inner(input, init);
      if (!read) {
        const room = ROOM_OPS.exec(path)?.[1] ?? null;
        if (!room && !ROOMS.test(path)) return inner(input, init);
        forget(url.origin, room);
        try {
          return await inner(input, init);
        } finally {
          forget(url.origin, room); // reads made while it was on its way saw the world before it
        }
      }
      if (!DISCOVERY.test(path) && !ROOM.test(path)) return inner(input, init);
      const now = Date.now();
      const e = keptAt(url.origin).get(path + url.search);
      const usable = e && (fresh ? e.fresh && now - e.started < JOIN_FRESH_MS : e.until > now);
      return toResponse(await untilAborted((usable ? e : start(url, init, fresh)).answer, init?.signal));
    }) as typeof fetch;

  return { fetch: shared(false), fresh: shared(true) };
}

const DISCOVERY = /\/discovery$/;
const ROOM = /\/rooms\/[^/]+$/;
const ROOMS = /\/rooms$/;
const ROOM_OPS = /(\/rooms\/[^/]+)\/ops$/;
/** Fresh reads this close together (one fire's change, told to each of its watchers) share one request. */
const JOIN_FRESH_MS = 1_000;

interface Entry {
  started: number;
  until: number;
  /** Started by a fresh read: after some change, so later fresh reads may join it. */
  fresh: boolean;
  answer: Promise<Answer>;
}

/** A response read once and kept, so every caller gets a fresh Response with the same body. */
interface Answer {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: ArrayBuffer;
}

const toAnswer = async (res: Response): Promise<Answer> => ({
  status: res.status,
  statusText: res.statusText,
  headers: [...res.headers],
  body: await res.arrayBuffer(),
});

/** Statuses a Response must be made without a body (the constructor throws otherwise). */
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

// A Response copies the bytes it's given, so one body serves every caller.
const toResponse = (a: Answer) =>
  new Response(NULL_BODY.has(a.status) ? null : a.body, { status: a.status, statusText: a.statusText, headers: a.headers });

/** Wait for a shared answer, but give up when this caller's own request is aborted (its timeout). */
function untilAborted<T>(p: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
