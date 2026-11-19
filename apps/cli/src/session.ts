import type { Wallet } from "@beaconsgg/identity";
import type { DailyLogs, FireView, SavedServer, Snapshot, Units } from "@watchfire/core";
import type { ScreenName } from "./app.tsx";

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
  /** The fetch Beacon requests go through (the SSH door shares reads and paces writes for all its players). */
  fetch?: typeof fetch;
  /** The fetch for reads that must be fresh (see ConnectOptions.freshFetch). */
  freshFetch?: typeof fetch;
  /** The SSH door's extras. Absent when playing locally. */
  door?: Door;
}

/** What the SSH door adds to a session. */
export interface Door {
  /** Who's connected right now. */
  online(): OnlineNode[];
  /** The screen this player just opened, for who's online. */
  onScreen(screen: ScreenName): void;
  /** The sysop's announcement, shown when the player arrives. */
  motd?: string;
  /** Keepers only: their recovery phrase, so they can take their keeper home. */
  revealPhrase?(): Promise<string | null>;
  /**
   * Keepers only: page another node with one line. `to` is who was on that node when the player
   * chose them (a node number is reused once they leave). Returns why not, or null once it's sent.
   */
  page?(to: OnlineNode, text: string): string | null;
  /** Hear pages to this node as they arrive. Returns the unsubscribe. */
  onPage(listener: (page: Page) => void): () => void;
  /** The last five pages this node has had, oldest first. */
  pages(): Page[];
}

/** A one-line message from another node. */
export interface Page {
  from: number;
  name: string;
  text: string;
  /** Epoch ms. */
  at: number;
}

/** One connected door session, for who's online. */
export interface OnlineNode {
  node: number;
  /** The keeper's name, or "a guest". */
  name: string;
  /** "at a fire", "surveying the world"… */
  activity: string;
  /** Epoch ms when they connected. */
  since: number;
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
  /** The fires as last read, so a server that's down at startup still shows them, as last seen. */
  known?: FireView[];
  /** The keeper's server list, with pinned keys. Absent until first saved. */
  servers?: SavedServer[];
  /** Set once the player has seen where their key lives. */
  toldKeyHint?: boolean;
  /** Distances in kilometres (the default) or miles. */
  units?: Units;
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
