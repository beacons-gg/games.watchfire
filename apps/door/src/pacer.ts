import { requestOf } from "./request.ts";

/**
 * Beacon limits signed writes per address (120 a minute by default), and every door player writes
 * from the door's one address. This fetch spaces writes (any non-GET) to each server evenly, at
 * `perMinute`, so the door stays under that. Reads go straight through.
 *
 * A write that would wait longer than `maxWaitMs` isn't queued: it gets the answer Beacon itself
 * gives an over-budget write (`rateLimited`), so the player sees "try again in a moment" at once
 * instead of the SDK timing the request out (15 s) while it waits here.
 */
export function pacedFetch(perMinute = 100, inner: typeof fetch = fetch, windowMs = 60_000, maxWaitMs = 10_000): typeof fetch {
  const gap = windowMs / perMinute;
  const nextAt = new Map<string, number>(); // origin -> when its next write may go

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const { read, url } = requestOf(input, init);
    if (read) return inner(input, init);
    const origin = url.origin;
    const now = Date.now();
    const at = Math.max(now, nextAt.get(origin) ?? 0);
    if (at - now > maxWaitMs) return busy(Math.ceil((at - now) / 1000));
    nextAt.set(origin, at + gap);
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
    return inner(input, init);
  }) as typeof fetch;
}

/** Beacon's own refusal for an over-budget write, so the SDK and the game treat it the same. */
const busy = (retryAfterSec: number) =>
  new Response(JSON.stringify({ ok: false, error: "rateLimited", message: "The door is busy. Try again in a moment." }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfterSec) },
  });
