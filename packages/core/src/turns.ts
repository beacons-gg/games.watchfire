import { LOGS_PER_DAY } from "./tuning.ts";

/** The client-enforced daily log count (see docs/beacon-integration.md). */
export interface DailyLogs {
  /** The day `logsUsed` counts for, YYYY-MM-DD in the keeper's day. */
  day?: string;
  logsUsed: number;
}

/** Logs left today. */
export function logsLeft(state: DailyLogs, today: string, perDay = LOGS_PER_DAY): number {
  return state.day === today ? Math.max(0, perDay - state.logsUsed) : perDay;
}

/** The state after spending one log today. */
export function spendLog<T extends DailyLogs>(state: T, today: string): T {
  const used = state.day === today ? state.logsUsed : 0;
  return { ...state, day: today, logsUsed: used + 1 };
}
