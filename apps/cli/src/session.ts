import type { Wallet } from "@beaconsgg/identity";
import type { DailyLogs, SavedServer, Snapshot } from "@watchfire/core";

/**
 * Everything the app needs from where it runs. The local CLI and the SSH door each build one, so
 * the same app runs in both.
 */
export interface Session {
  /** The keeper's wallet, or null for a watch-only guest. */
  wallet: Wallet | null;
  /** This keeper's saved state (watch place, logs today, embers, last snapshot). */
  store: KeeperStore;
  /** The servers a new keeper starts with. */
  defaultServers: readonly string[];
  /** Servers fixed for this session (e.g. `--server`): used as given, never saved. */
  fixedServers?: readonly string[];
  /** The BBS node number shown in the frame. */
  node: number;
  /** 24 for truecolor terminals, 8 for 256 colors. */
  colorDepth: 8 | 24;
  /** Today's date as YYYY-MM-DD in the keeper's day, for the logs-per-day count. */
  today(): string;
  /** Where the wallet lives, shown to the player once. Absent in the door. */
  keyHint?: string;
  /** What a guest is told when they try to act. */
  guestHint?: string;
  /** Room type to play; tests and spikes use their own. */
  fireType?: string;
}

export interface WatchPlace {
  name: string;
  label: string;
  lat: number;
  lng: number;
}

export interface EmberRecord {
  fireId: string;
  fireName: string;
  at: number;
}

export interface KeeperState extends DailyLogs {
  watch?: WatchPlace;
  embers: EmberRecord[];
  /** Fires whose ashes this keeper raked. */
  raked: string[];
  /** The world as of the last look, for "since your last visit" news. */
  snapshot?: Snapshot;
  /** The keeper's server list, with pinned keys. Absent until first saved. */
  servers?: SavedServer[];
  /** Set once the player has seen where their key lives. */
  toldKeyHint?: boolean;
}

export interface KeeperStore {
  load(): Promise<KeeperState>;
  save(state: KeeperState): Promise<void>;
}

export const emptyKeeper = (): KeeperState => ({ logsUsed: 0, embers: [], raked: [] });

/** In-memory store, for guests and tests. */
export function memoryKeeperStore(initial: KeeperState = emptyKeeper()): KeeperStore {
  let state = structuredClone(initial);
  return {
    load: async () => structuredClone(state),
    save: async (s) => {
      state = structuredClone(s);
    },
  };
}

export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
