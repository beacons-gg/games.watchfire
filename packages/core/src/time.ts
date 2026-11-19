export const DAY_SEC = 86400;

/** Now, in epoch seconds: the unit every fire time uses. */
export const nowSec = () => Math.floor(Date.now() / 1000);

/** "3h12m", "45m", "2d4h". */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const hhmm = (d: Date) => d.toTimeString().slice(0, 5);

/** "22:40" today, or "Thu 09:15" further out. */
export function clock(epochSec: number, now = Date.now()): string {
  const d = new Date(epochSec * 1000);
  return sameDay(d, new Date(now)) ? hhmm(d) : `${d.toLocaleDateString("en-US", { weekday: "short" })} ${hhmm(d)}`;
}

/** "just now", "3h12m ago". */
export function ago(epochSec: number): string {
  const s = Date.now() / 1000 - epochSec;
  return s < 60 ? "just now" : `${formatDuration(s)} ago`;
}

/** "Nov 18". */
export const shortDate = (epochSec: number) =>
  new Date(epochSec * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** A news timestamp, 9 columns: "22:40    " today, else "Nov 18   ". */
export function stamp(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  return sameDay(d, new Date())
    ? hhmm(d) + "    "
    : d.toLocaleDateString("en-US", { month: "short", day: "2-digit" }).padEnd(9);
}
