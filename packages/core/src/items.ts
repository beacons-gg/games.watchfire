import { signItemProvenance, walletMinter, type Wallet } from "@beaconsgg/identity";
import type { OpaqueItem } from "@beaconsgg/protocol-types";
import { ulid } from "ulid";

/** Mint a signed item. `birth` is signed and ours; `match` is unsigned and what policies read. */
export function mintItem(
  wallet: Wallet,
  birth: Record<string, unknown>,
  match?: OpaqueItem["match"],
): OpaqueItem {
  const unique = ulid();
  const mintedBy = signItemProvenance({ unique, birth }, walletMinter(wallet));
  return { unique, birth, mintedBy, ...(match ? { match } : {}) };
}

const WOODS = ["oak", "ash", "birch", "pine", "cedar", "driftwood", "applewood"] as const;

/** A log. `kindling` marks the first log, laid by whoever lit the fire. */
export function mintLog(wallet: Wallet, opts: { kindling?: boolean } = {}): OpaqueItem {
  const wood = WOODS[Math.floor(Math.random() * WOODS.length)];
  return mintItem(
    wallet,
    { kind: "log", wood, ...(opts.kindling ? { kindling: true } : {}) },
    { class: "log", levels: { log: 1 } },
  );
}

/** The ember pool a fire is lit with: one per possible keeper. */
export function mintEmbers(wallet: Wallet, count: number, fireName: string): OpaqueItem[] {
  return Array.from({ length: count }, (_, i) =>
    mintItem(wallet, { kind: "ember", fire: fireName, n: i + 1 }, { class: "ember" }),
  );
}
