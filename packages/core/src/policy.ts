import type { Policy } from "@beaconsgg/protocol-types";
import { WARM, type FireTuning } from "./tuning.ts";

/**
 * A fire's room policy. The server enforces all of it:
 *
 * - `burning` until `outAt`, then `ash`. Nobody can add a log to ash.
 * - `outAt = placedAt + baseSec + logs * secPerLog`, so every log pushes the deadline back.
 * - Only items of class `log` with `levels.log >= 1` get in. `logs` counts items, not levels,
 *   so a forged "huge log" still counts once. `capacity` caps the fire's whole life.
 * - Each keeper (contributor) may collect one ember once the fire holds `emberAt` logs.
 * - In ash, each keeper may rake their logs back once, as a record of fires they tended.
 * - Anyone may warm their hands once per target (the kindling log), from any Beacon game: `react`
 *   is the one op open to other games. Everything else is Watchfire's alone.
 *
 * Note: Beacon's `count` takes a key and counts only items with an integer at that key, which is
 * why every log carries `match.levels.log = 1`.
 */
export function firePolicy(t: FireTuning, type: string): Policy {
  return {
    type,
    ops: {
      list: { role: "public" },
      contribute: { role: "public", phase: "burning" },
      collect: { role: "contributor", phase: "burning" },
      claim: { role: "contributor", phase: "ash" },
      react: { role: "public", games: ["*"] },
    },
    lifecycle: { phases: ["burning", "ash"], transitions: { ash: "outAt" } },
    derived: {
      logs: { count: [{ var: "contents" }, "log"] },
      outAt: { "+": [{ var: "placedAt" }, t.baseSec, { "*": [{ var: "logs" }, t.secPerLog] }] },
    },
    accept: { class: ["log"], minLevels: { log: 1 }, capacity: t.capacity },
    maxContributors: t.capacity,
    grant: { op: "collect", from: "embers", count: 1, when: { ">=": [{ var: "logs" }, t.emberAt] } },
    onEmpty: "close",
    claimTtl: t.claimTtl,
  } as Policy;
}

