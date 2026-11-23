/** The Beacon game slug. Every write signs it, and the server must admit it. */
export const GAME_SLUG = "watchfire-door";

/** Room type of a real fire. Spikes and tests use other types so they never show up in play. */
export const FIRE_TYPE = "watchfire";

/** Servers a fresh install trusts. The player can add more. */
export const DEFAULT_SERVERS = ["https://9q72.beacons.gg"] as const;

/** Where the game is published (GitHub releases), and where players download the latest. */
export const RELEASES_REPO = "beacons-gg/games.watchfire";
export const DOWNLOAD_URL = `https://github.com/${RELEASES_REPO}/releases/latest`;

/** Logs a player may add per day. Enforced by the client only (see docs/beacon-integration.md). */
export const LOGS_PER_DAY = 3;

/** The reaction kind for "warm your hands". */
export const WARM = "warm";

/**
 * The numbers a fire's policy is built from. They are frozen into each room at placement, so a
 * change affects only fires lit afterwards.
 */
export interface FireTuning {
  /** Seconds a fire burns with no logs at all. */
  baseSec: number;
  /** Seconds each log pushes the fire's "out" time back. */
  secPerLog: number;
  /** Most logs a fire holds. Caps a fire's life at baseSec + capacity * secPerLog. */
  capacity: number;
  /** Logs a fire needs before its keepers may collect an ember. */
  emberAt: number;
  /** How long keepers may rake the ashes after the fire goes out. */
  claimTtl: string;
}

/**
 * Starting values for a small group of players (a handful to a few dozen). Tune by playtest.
 *
 * - A lone keeper gets a fire to the next day: lighting plus 2 logs gives 12h + 3 x 4h = 24h.
 *   Alone they add 12h a day against a 24h day, so a solo fire dies around hour 36.
 * - Two keepers keep pace with the clock (6 logs = 24h a day) and can run a fire to its cap.
 * - A fire dies within 12h + 12 x 4h = 60h however hard it's fed, so the map turns over.
 * - An ember (5 logs) takes one player two days, or two players one.
 */
export const FIRE_TUNING: FireTuning = {
  baseSec: 12 * 3600,
  secPerLog: 4 * 3600,
  capacity: 12,
  emberAt: 5,
  claimTtl: "2d",
};

/** Seconds-scale values for spikes and tests. */
export const SPIKE_TUNING: FireTuning = {
  baseSec: 20,
  secPerLog: 8,
  capacity: 6,
  emberAt: 2,
  claimTtl: "10m",
};
