import { useEffect, useState } from "react";
import type { WorldReport } from "@watchfire/core/report";

const LOOK_MS = 30_000;

/**
 * The door's latest look at the world, read every 30 seconds; `error` when the last read failed
 * (`report` then stays the last one that worked, or null before any). And a clock in the door's
 * time (`now`, epoch seconds) that ticks every second, so countdowns run between reads.
 */
export function useWorld(): { report: WorldReport | null; error: string | null; now: number } {
  const [report, setReport] = useState<WorldReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0); // the door's clock minus ours, seconds
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const read = async () => {
      try {
        const res = await fetch("/api/world", { cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 503 ? "The door is taking its first look at the world." : `The door answered ${res.status}.`);
        const next = (await res.json()) as WorldReport;
        if (!alive) return;
        // The door's clock is when it answered (its Date header), not `at`: that's when it last
        // looked, which may be a while ago if its servers are quiet.
        const served = Date.parse(res.headers.get("date") ?? "");
        setOffset((Number.isNaN(served) ? next.at * 1000 : served) / 1000 - Date.now() / 1000);
        setReport(next);
        setError(null);
      } catch (e) {
        if (alive) setError((e as Error).message || "The door isn't answering.");
      }
    };
    void read();
    const look = setInterval(read, LOOK_MS);
    const clock = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(look);
      clearInterval(clock);
    };
  }, []);

  return { report, error, now: Math.floor(tick / 1000 + offset) };
}
