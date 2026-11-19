/** What a player reads when a server refuses a move. Never show a raw code. */
const REFUSALS: Record<string, string> = {
  phase: "That fire has gone out.",
  full: "That fire can't take another log.",
  denied: "The fire won't take that.",
  expired: "Nothing left there but cold ash.",
  unknownRoom: "That fire is gone.",
  gone: "That fire is gone.",
  empty: "Nothing left to take.",
  rateLimited: "The wind's too strong. Try again in a moment.",
  clockSkew: "Your clock is off. Check your system time and try again.",
  badsig: "Your keeper's key wasn't accepted. Try restarting Watchfire.",
  deviceRevoked: "This device was revoked for your keeper.",
  gameNotAdmitted: "That server doesn't host Watchfire.",
  notMember: "That server only takes members.",
  writeLocked: "That server is read-only right now. Try again later.",
};

/** What a player reads when a move is blocked before it reaches the server. */
export const MOVE_TEXT = {
  outOfLogs: "You're out of logs for today. More tomorrow.",
  feedAsh: "That fire has gone out. Light a new one, or feed another.",
  feedFull: "That fire can't take another log. It will burn until it's spent.",
  emberAsh: "Ash gives no embers.",
  emberHeld: "You already carry an ember from this fire.",
  emberNotKeeper: "Only keepers may take embers. Lay a log first.",
  warmAsh: "There's no warmth left in these ashes.",
  warmDone: "You've already warmed your hands here.",
  rakeBurning: "The fire's still burning. Rake the ashes once it goes dark.",
  rakeNotKeeper: "Only keepers have logs in these ashes.",
  rakeDone: "You've already raked these ashes.",
  watchOnly: "You only watch this fire's server. Switch it to play under Servers to keep it.",
} as const;

export const emberNeedsText = (emberAt: number, logs: number) =>
  `The fire needs ${emberAt} logs before it gives embers (it has ${logs}).`;

/** Refusals whose meaning depends on the move. */
const BY_OP: Record<string, Record<string, string>> = {
  claim: {
    phase: MOVE_TEXT.rakeBurning,
    denied: MOVE_TEXT.rakeNotKeeper,
    gone: MOVE_TEXT.rakeDone,
  },
  collect: {
    denied: MOVE_TEXT.emberNotKeeper,
  },
  react: {
    gone: "There's nothing left to warm your hands at.",
  },
};

/** What to tell the player about a refused move. Pass the op for move-specific wording. */
export function refusalText(code: string | undefined, op?: string): string {
  if (!code) return "Something went wrong. Try again.";
  return (op ? BY_OP[op]?.[code] : undefined) ?? REFUSALS[code] ?? `The fire sputters (${code}). Try again.`;
}
