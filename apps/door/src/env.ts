// Reading settings, and the door's log line. Nothing here runs on load, so the entry point can use
// it to report a setting that stops the door (settings.ts reads them all when it loads).

/** A setting, or undefined when it's unset or blank (a blank line in .env means "the default"). */
export const setting = (name: string): string | undefined => process.env[name]?.trim() || undefined;

/** A number setting, its default when unset or blank. Anything else that isn't a number stops the door. */
export function numberSetting(name: string, fallback: number): number {
  const raw = setting(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a number, not "${raw}"`);
  return n;
}

/** One JSON line on stdout. */
export const log = (event: string, fields: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
