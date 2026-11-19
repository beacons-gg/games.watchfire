import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadOrCreateWallet, revealRecoveryPhrase, type SecureKeyStore } from "@beaconsgg/client-sdk";
import type { Wallet } from "@beaconsgg/identity";
import type { KeeperStore } from "watchfire/session";
import { readOrCreate } from "./files.ts";
import { setting } from "./env.ts";
import type { DoorStore, FileStore } from "./store.ts";

export interface Keeper {
  wallet: Wallet;
  store: KeeperStore;
  /** The recovery phrase, for "take your keeper home". */
  revealPhrase(): Promise<string | null>;
}

/** A keeper's id in the store: its SSH key's SHA-256, hex. */
const keeperId = (sshKey: Buffer) => createHash("sha256").update(sshKey).digest("hex");

/**
 * The door holds a Beacon wallet for each SSH key: an SSH session can't sign with the player's own
 * keys. Each keeper is kept in the door's store under its SSH key's SHA-256, the wallet store's
 * values (recovery phrase included) encrypted with the door's master key (AES-256-GCM), so the
 * store (files or a database) is no use without it.
 *
 * The master key (32 bytes, hex or base64) comes from the environment or a secret file, or, for a door
 * kept in files, is made once and kept in `<home>/master.key` (see masterKey). Moving it to a KMS
 * is on the roadmap.
 */
export class Keepers {
  private readonly store: DoorStore;
  private readonly key: Buffer;

  constructor(store: DoorStore, key: Buffer) {
    this.store = store;
    this.key = key;
  }

  /**
   * The keeper for an SSH public key (its wire-format blob): made on the first visit. The door
   * seats one session per keeper, so two opens of one key never race to make two wallets.
   */
  async open(sshKey: Buffer): Promise<Keeper> {
    const kept = await this.store.keeper(keeperId(sshKey));
    const keys = sealed(kept.keys, this.key);
    return { wallet: await loadOrCreateWallet(keys), store: kept.state, revealPhrase: () => revealRecoveryPhrase(keys) };
  }
}

/** A key store whose values are sealed with AES-256-GCM: `v1:` + base64(iv | tag | ciphertext). */
function sealed(store: SecureKeyStore, key: Buffer): SecureKeyStore {
  const seal = (plain: string) => {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
    return `v1:${Buffer.concat([iv, c.getAuthTag(), body]).toString("base64")}`;
  };
  const unseal = (stored: string) => {
    if (!stored.startsWith("v1:")) throw new Error("unknown sealed keeper format");
    const raw = Buffer.from(stored.slice(3), "base64");
    const d = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  };
  return {
    getItem: async (k) => {
      const v = await store.getItem(k);
      return v === null ? null : unseal(v);
    },
    setItem: (k, v) => store.setItem(k, seal(v)),
    deleteItem: (k) => store.deleteItem(k),
  };
}

/**
 * The master key: WATCHFIRE_DOOR_MASTER_KEY itself, or the file WATCHFIRE_DOOR_MASTER_KEY_FILE
 * names (a Docker secret), or else, for a door kept in files, `<home>/master.key`, made on first
 * start. A door kept in a database must be given it: making one would leave it on this disk,
 * where nobody would think to back it up.
 */
export function masterKey(store: DoorStore): Buffer {
  const value = setting("WATCHFIRE_DOOR_MASTER_KEY");
  const file = setting("WATCHFIRE_DOOR_MASTER_KEY_FILE");
  if (!value && !file && store.kind !== "files") throw new Error("A door kept in a database needs its master key: set WATCHFIRE_DOOR_MASTER_KEY_FILE (or WATCHFIRE_DOOR_MASTER_KEY)");
  const source = value ? "WATCHFIRE_DOOR_MASTER_KEY" : (file ?? join((store as FileStore).home, "master.key"));
  const text = value ?? (file ? readFileSync(file, "utf8") : readOrCreate(source, () => randomBytes(32).toString("base64")));
  // Hex (openssl rand -hex 32: nothing a settings page could mangle) or base64.
  const trimmed = text.trim();
  const key = Buffer.from(trimmed, /^[0-9a-f]{64}$/i.test(trimmed) ? "hex" : "base64");
  if (key.length !== 32) throw new Error(`${source} must hold 32 bytes, hex or base64`);
  return key;
}
