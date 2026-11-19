import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { loadOrCreateWallet, revealRecoveryPhrase, type SecureKeyStore } from "@beaconsgg/client-sdk";
import type { Wallet } from "@beaconsgg/identity";
import { fileKeeperStore, fileKeyStore } from "watchfire/local";
import type { KeeperStore } from "watchfire/session";
import { readOrCreate } from "./files.ts";

export interface Keeper {
  wallet: Wallet;
  store: KeeperStore;
  /** The recovery phrase, for "take your keeper home". */
  revealPhrase(): Promise<string | null>;
}

/** Where a keeper's files live: one folder per SSH key, named by the key's SHA-256. */
export const keeperDir = (home: string, sshKey: Buffer) => join(home, "keepers", createHash("sha256").update(sshKey).digest("hex"));

/**
 * The door holds a Beacon wallet for each SSH key: an SSH session can't sign with the player's own
 * keys. Each keeper lives in `<home>/keepers/<sha256 of the SSH key>/`, the wallet store's values
 * (recovery phrase included) encrypted with the door's master key (AES-256-GCM).
 *
 * The master key comes from WATCHFIRE_DOOR_MASTER_KEY (32 bytes, base64), or is made once and kept
 * in `<home>/master.key`. Moving it to a KMS is on the roadmap.
 */
export class Keepers {
  private readonly home: string;
  private readonly key: Buffer;

  constructor(home: string) {
    this.home = home;
    this.key = masterKey(home);
  }

  /**
   * The keeper for an SSH public key (its wire-format blob): made on the first visit. The door
   * seats one session per keeper, so two opens of one key never race to make two wallets.
   */
  async open(sshKey: Buffer): Promise<Keeper> {
    const dir = keeperDir(this.home, sshKey);
    const keys = sealed(await fileKeyStore(dir), this.key);
    const [wallet, store] = await Promise.all([loadOrCreateWallet(keys), fileKeeperStore(dir)]);
    return { wallet, store, revealPhrase: () => revealRecoveryPhrase(keys) };
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

function masterKey(home: string): Buffer {
  const fromEnv = process.env.WATCHFIRE_DOOR_MASTER_KEY;
  const source = fromEnv ? "WATCHFIRE_DOOR_MASTER_KEY" : join(home, "master.key");
  const key = Buffer.from(fromEnv ?? readOrCreate(source, () => randomBytes(32).toString("base64")).trim(), "base64");
  if (key.length !== 32) throw new Error(`${source} must hold 32 bytes, base64`);
  return key;
}
