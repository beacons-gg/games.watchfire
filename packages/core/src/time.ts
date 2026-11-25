export const DAY_SEC = 86400;

/** Under this much time left a fire is urgent (red); under LOW_SEC, low (orange). */
export const URGENT_SEC = 3 * 3600;
export const LOW_SEC = 12 * 3600;

/** How a fire reads by its time left, in the terminal and on the website alike. */
export const urgency = (secondsLeft: number): "urgent" | "low" | "well" =>
  secondsLeft < URGENT_SEC ? "urgent" : secondsLeft < LOW_SEC ? "low" : "well";

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

/** A long span in words: "60 hours", or "30 days and 12 hours" from three days up. */
export function spanText(sec: number): string {
  const hours = Math.round(sec / 3600);
  if (hours < 72) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return `${d} days${h ? ` and ${h} hour${h === 1 ? "" : "s"}` : ""}`;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const hhmm = (d: Date) => d.toTimeString().slice(0, 5);

/** "22:40" today, or "Thu 09:15" further out. */
export function clock(epochSec: number, now = Date.now()): string {
  const d = new Date(epochSec * 1000);
  return sameDay(d, new Date(now)) ? hhmm(d) : `${d.toLocaleDateString("en-US", { weekday: "short" })} ${hhmm(d)}`;
}

/** "just now", "3h12m ago". `now` in epoch seconds (the website passes the door's clock). */
export function ago(epochSec: number, now = Date.now() / 1000): string {
  const s = now - epochSec;
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
