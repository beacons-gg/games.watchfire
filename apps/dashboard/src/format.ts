import { FIRE_TUNING, LOGS_PER_DAY } from "@watchfire/core/tuning";
import { spanText } from "@watchfire/core/time";
import type { ReportFire } from "@watchfire/core/report";

// The game's own time words and thresholds, so the site and the terminal agree.
export { ago, burnFraction, clock, DAY_SEC, formatDuration as duration, urgency } from "@watchfire/core/time";

/** The rules, from the tuning the game itself uses, in hours for people. */
export const RULES = {
  logsPerDay: LOGS_PER_DAY,
  baseHours: FIRE_TUNING.baseSec / 3600,
  hoursPerLog: FIRE_TUNING.secPerLog / 3600,
  capacity: FIRE_TUNING.capacity,
  emberAt: FIRE_TUNING.emberAt,
  maxLife: spanText(FIRE_TUNING.baseSec + FIRE_TUNING.capacity * FIRE_TUNING.secPerLog),
};

/** Still burning at `now` (a fire's stored phase lags its clock). */
export const isLit = (f: ReportFire, now: number) => f.phase === "burning" && f.outAt > now;
