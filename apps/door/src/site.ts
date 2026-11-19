// The website: the door's own look at the world, and the dashboard. It runs inside the door, or on
// its own (WATCHFIRE_DOOR_PORT=0) on a machine with no door: a public site for a door elsewhere.

import type { Server } from "node:http";
import { log } from "./env.ts";
import { BIND, FIRE_TYPE, JOIN, PUBLIC_PORT, SERVERS, WEB_PORT, WEB_ROOT } from "./settings.ts";
import { openStore, type DoorStore } from "./store.ts";
import { startWeb } from "./web.ts";
import { WorldWatch } from "./world.ts";

/**
 * Start the website. `door` is the door on this machine (who's on it), or null when there's none:
 * then the join command is WATCHFIRE_JOIN's (a door elsewhere), or none, and the site says nothing
 * about who's online.
 */
export function startSite(store: DoorStore, fetch: typeof globalThis.fetch, door: { online(): number } | null): Server {
  const world = new WorldWatch({ servers: SERVERS, ...FIRE_TYPE, fetch, store, log });
  void world.start();
  return startWeb({
    port: WEB_PORT,
    bind: BIND,
    root: WEB_ROOT,
    report: () => world.report(),
    online: () => door?.online() ?? null,
    join: (host) => JOIN ?? (door ? `ssh ${PUBLIC_PORT === 22 ? "" : `-p ${PUBLIC_PORT} `}${host}` : null),
    log,
  });
}

/** The website alone: no ssh, no keepers, no master key. Its watch log is its own (keep it apart from a door's). */
export async function siteAlone(): Promise<void> {
  const store = await openStore();
  const web = startSite(store, fetch, null);
  log("site-only", { store: store.where, servers: SERVERS, join: JOIN ?? null });
  const shutdown = () => {
    web.close();
    void store.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
