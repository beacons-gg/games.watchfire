import { BlockList, isIP } from "node:net";

/**
 * The sysop's ban list, one entry a line, `#` starts a comment:
 *
 *   SHA256:pSx4ZODTZVdpnXk1zqy8OGQWW/CNoJlmzBEzAWhZoDk   # an SSH key, as the door's logs name it
 *   203.0.113.7                                          # an address
 *   198.51.100.0/24                                      # a range (IPv4 or IPv6)
 *
 * It lives in the door's store (`bans.txt`, or the database) and the sysop's `ban` and `unban`
 * commands edit it. The door reads it every few seconds and `load`s it, which parses it again
 * only when it has changed: a ban takes effect without a restart, and players already on are
 * shown out. A banned key can still come in as a guest (watch only) unless its address is banned too.
 */
export class Bans {
  private readonly warn: (line: string) => void;
  private text: string | null = null;
  private keys = new Set<string>();
  private ips = new BlockList();

  constructor(warn: (line: string) => void = () => {}) {
    this.warn = warn;
  }

  /** Is this address banned? */
  ip(address: string): boolean {
    // BlockList matches an IPv4 ban against its IPv6-mapped form (::ffff:203.0.113.7) too.
    const family = isIP(address);
    return family !== 0 && this.ips.check(address, family === 4 ? "ipv4" : "ipv6");
  }

  /** Is this SSH key (its SHA256: fingerprint) banned? */
  key(fingerprint: string): boolean {
    return this.keys.has(fingerprint);
  }

  /** Take the list as it is now; parsed again only when it has changed. */
  load(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.keys = new Set();
    this.ips = new BlockList();
    for (const line of text.split("\n")) {
      const entry = entryOf(line);
      if (!entry) continue;
      const ban = banOf(entry);
      if (ban?.kind === "key") this.keys.add(entry);
      else if (ban?.kind === "address") this.ips.addAddress(ban.net, ban.type);
      else if (ban) this.ips.addSubnet(ban.net, ban.prefix, ban.type);
      else this.warn(entry);
    }
  }
}

/** A line's entry, without its comment. */
export const entryOf = (line: string) => line.replace(/#.*/, "").trim();

type Family = "ipv4" | "ipv6";

/** What an entry bans: a key, an address or a range. Null when it's none of them. */
export function banOf(entry: string): { kind: "key" } | { kind: "address"; net: string; type: Family } | { kind: "range"; net: string; prefix: number; type: Family } | null {
  if (/^SHA256:[A-Za-z0-9+/]{43}$/.test(entry)) return { kind: "key" };
  const [net = "", bits, ...rest] = entry.split("/");
  const family = isIP(net);
  if (!family || rest.length) return null;
  const type = family === 4 ? "ipv4" : "ipv6";
  if (bits === undefined) return { kind: "address", net, type };
  // BlockList throws on a prefix longer than the address (10.0.0.0/33).
  const prefix = Number(bits);
  return /^\d+$/.test(bits) && prefix <= (family === 4 ? 32 : 128) ? { kind: "range", net, prefix, type } : null;
}
