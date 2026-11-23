// Is a newer Watchfire out? The game on a player's own computer never updates itself, so it asks
// GitHub for the latest release, at most once a day, and remembers the answer in its config folder.
// Anything that goes wrong (offline, GitHub slow or refusing, a release it can't read) means it
// says nothing. WATCHFIRE_NO_UPDATE_CHECK=1 turns it off.

import { join } from "node:path";
import { DOWNLOAD_URL, RELEASES_REPO } from "@watchfire/core";
import { readJson, writePrivate } from "./local.ts";

const LATEST = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 4000;

/** The last look, kept between runs. `latest` is null when the look found nothing it could use. */
interface LastLook {
  at: number;
  latest: string | null;
}

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** Whether `latest` is a newer release than `current` (x.y.z, maybe with a -suffix for a pre-release). */
export function isNewer(latest: string, current: string): boolean {
  const a = VERSION.exec(latest.trim());
  const b = VERSION.exec(current.trim());
  if (!a || !b) return false;
  for (let i = 1; i <= 3; i++) {
    const d = Number(a[i]) - Number(b[i]);
    if (d !== 0) return d > 0;
  }
  // The same x.y.z: the release is newer than its own pre-release (0.2.0 after 0.2.0-rc.1).
  return !a[4] && !!b[4];
}

/**
 * The line to show when a newer release is out, or null. Looks at GitHub when the last look is a
 * day old (or there's none), else goes by the last look.
 */
export async function newVersion(
  current: string,
  opts: { dir: string; fetch?: typeof fetch; now?: () => number },
): Promise<string | null> {
  const fetchFn = opts.fetch ?? fetch;
  const now = (opts.now ?? Date.now)();
  const file = join(opts.dir, "update-check.json");
  try {
    let look = await readJson<LastLook>(file).catch(() => null);
    if (!look || typeof look.at !== "number" || !(now - look.at < DAY_MS && now >= look.at)) {
      look = { at: now, latest: await latestRelease(fetchFn) };
      await writePrivate(file, JSON.stringify(look)).catch(() => {});
    }
    if (!look.latest || !isNewer(look.latest, current)) return null;
    return `Watchfire ${look.latest} is out (you have ${current}): ${DOWNLOAD_URL.replace(/^https:\/\//, "")}`;
  } catch {
    return null;
  }
}

/** The latest release's version from GitHub (pre-releases aren't "latest"), or null. */
async function latestRelease(fetchFn: typeof fetch): Promise<string | null> {
  try {
    const res = await fetchFn(LATEST, {
      headers: { accept: "application/vnd.github+json", "user-agent": "watchfire" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const tag = ((await res.json()) as { tag_name?: unknown }).tag_name;
    return typeof tag === "string" && VERSION.test(tag) ? tag.replace(/^v/, "") : null;
  } catch {
    return null;
  }
}
