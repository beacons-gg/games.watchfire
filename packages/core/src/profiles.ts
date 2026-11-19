import type { BeaconClient } from "@beaconsgg/client-sdk";
import { buildProfile, type Wallet } from "@beaconsgg/identity";
import { safeText } from "./text.ts";

export const MAX_NAME = 24;

/** This device as a profile lists it. */
const thisDevice = (wallet: Wallet) => ({ did: wallet.device.did, auth: wallet.auth });

/** A profile with nothing but this device: for a player who has never published one. */
export const bareProfile = (wallet: Wallet) => buildProfile(wallet.account, { devices: [thisDevice(wallet)] });

export interface NameResult {
  ok: boolean;
  /** Servers that took the new profile. */
  published: number;
  reason?: string;
}

/**
 * Set the player's Beacon display name, keeping everything else in their profile: other devices,
 * revocations, handles, avatar, services, and any fields from newer builds (`supersedes`).
 *
 * `buildProfile` drops `keyAgreement` (an encryption key another game may manage), so when the
 * current profile has one we refuse rather than strip it. The player renames in that game instead.
 */
export async function publishDisplayName(
  client: BeaconClient,
  readOrigins: readonly string[],
  writeOrigins: readonly string[],
  wallet: Wallet,
  name: string,
): Promise<NameResult> {
  const displayName = safeText(name, MAX_NAME);
  if (!displayName) return { ok: false, published: 0, reason: "A name needs at least one letter." };
  const current = await client.fetchBestProfile(readOrigins, wallet.account.did);
  if (current?.keyAgreement) {
    return {
      ok: false,
      published: 0,
      reason: "Your Beacon profile is managed by another game. Change your name there and it shows up here.",
    };
  }
  // A profile stores each device as { key, auth: { issued, expires?, sig } }; buildProfile takes the
  // full authorization back, whose `authorizes` and `account` are the entry's key and the profile id.
  const devices = (current?.devices ?? []).map((d) => ({
    did: d.key,
    auth: { authorizes: d.key, account: current!.id, ...d.auth },
  }));
  if (!devices.some((d) => d.did === wallet.device.did)) devices.push(thisDevice(wallet));
  const profile = buildProfile(wallet.account, {
    version: (current?.version ?? 0) + 1,
    displayName,
    devices,
    ...(current?.revoked ? { revoked: current.revoked } : {}),
    ...(current?.handles ? { handles: current.handles } : {}),
    ...(current?.avatar ? { avatar: current.avatar } : {}),
    ...(current?.services ? { services: current.services } : {}),
    supersedes: current,
  } as Parameters<typeof buildProfile>[1]);
  let published = 0;
  let lastError: string | undefined;
  for (const origin of writeOrigins) {
    try {
      const r = await client.publishProfile(origin, profile);
      if (r.ok) published++;
      else lastError = r.error;
    } catch (e: any) {
      lastError = e?.code ?? e?.message;
    }
  }
  return published > 0 ? { ok: true, published } : { ok: false, published, reason: lastError ?? "no server took it" };
}
