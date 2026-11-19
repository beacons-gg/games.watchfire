import { canAskToJoin, serverLabel, type ServerStatus } from "./servers.ts";

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
  gameNotAccepted: "That fire belongs to another game.",
  notMember: "That server only takes members. Ask to join under Servers (J).",
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

/** Why the player can't act on a server they listed (see `canPlayOn`). */
type ServerLike = { name?: string; host?: string; origin: string; state?: string; mode?: string; accessLevel?: string; access?: string };

export function readOnlyText(s: ServerLike): string {
  const name = serverLabel(s);
  if (s.state !== "ok") return `${name} isn't taking moves right now.`;
  if (s.mode === "watch") return MOVE_TEXT.watchOnly;
  if (s.access === "pending") return `You've asked to join ${name}. Its operator hasn't let you in yet.`;
  if (s.access === "declined") return `${name} declined your request to join.`;
  if (s.accessLevel === "private") return `${name} is members-only. Ask its operator to add you.`;
  return `${name} is members-only. Ask to join under Servers (J).`;
}

/** Why J (ask to join) does nothing on this server. */
export function joinBlockedText(s: ServerLike): string {
  const name = serverLabel(s);
  if (s.accessLevel === "private") return `${name} takes no requests. Ask its operator to add you.`;
  if (s.access === "pending") return `You've already asked to join ${name}. Its operator will decide.`;
  if (s.access === "declined") return `${name} declined your request. Only its operator can change that.`;
  if (s.access === "member") return `You're already a member of ${name}.`;
  return `${name} is open: no need to join.`;
}

/**
 * Why the player can't ask to join this server now, or null when they can. One rule for greying
 * the J key and for explaining a refused press, as `moveBlocker` is for moves.
 */
export function joinBlocker(s: ServerLike, ctx: { guest: boolean; guestHint: string }): string | null {
  if (ctx.guest) return ctx.guestHint;
  return canAskToJoin(s as ServerStatus) ? null : joinBlockedText(s);
}

/** What to tell the player when a members-only server answers their request. */
export const membershipChangeText = (s: ServerLike) =>
  `${serverLabel(s)} ${s.access === "member" ? "let you in." : "declined your request."}`;

/** What to tell the player right after asking to join. */
export const joinResultText = (s: ServerLike, access?: string) =>
  access === "member" ? `You're a member of ${serverLabel(s)}.` : `You've asked to join ${serverLabel(s)}. Its operator will decide.`;

/** No server the player plays on would take a fire at this place. */
export const uncoveredText = (place: string) => `None of the servers you play on covers ${place}, so you can't light fires there.`;

/** A fire whose server stopped answering. */
export const lastSeenText = (s: ServerLike | undefined, ago: string) =>
  `${s ? serverLabel(s) : "Its server"} isn't answering. Last seen ${ago}; times are estimates from then.`;

/**
 * What to tell the player about a failed move, whatever threw: a refusal with a code, a move the
 * client stopped with a worded reason (`ReadOnlyError`), or anything else.
 */
export function moveErrorText(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === "readOnly" && err.message) return err.message;
  if (err?.code) return refusalText(err.code);
  return `The fire sputters: ${String(err?.message ?? e).slice(0, 120)}`;
}

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
  requestAccess: {
    denied: "That server takes no requests. Ask its operator to add you.",
  },
};

/** What to tell the player about a refused move. Pass the op for move-specific wording. */
export function refusalText(code: string | undefined, op?: string): string {
  if (!code) return "Something went wrong. Try again.";
  return (op ? BY_OP[op]?.[code] : undefined) ?? REFUSALS[code] ?? `The fire sputters (${code}). Try again.`;
}
