import { readFileSync, statSync } from "node:fs";
import { BlockList, isIP } from "node:net";

/**
 * The sysop's ban list: `<home>/bans.txt`, one entry a line, `#` starts a comment.
 *
 *   SHA256:pSx4ZODTZVdpnXk1zqy8OGQWW/CNoJlmzBEzAWhZoDk   # an SSH key, as the door's logs name it
 *   203.0.113.7                                          # an address
 *   198.51.100.0/24                                      # a range (IPv4 or IPv6)
 *
 * The door calls `reload()` every few seconds, which reads the file again only when it has
 * changed: a ban takes effect without a restart, and players already on are shown out. A banned key can still come in as a guest (watch
 * only) unless its address is banned too.
 */
export class Bans {
  private readonly path: string;
  private readonly warn: (line: string) => void;
  private mtime = -1;
  private keys = new Set<string>();
  private ips = new BlockList();

  constructor(path: string, warn: (line: string) => void = () => {}) {
    this.path = path;
    this.warn = warn;
    this.reload();
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

  /** Read the list again if the file has changed since the last read. */
  reload(): void {
    let mtime = 0;
    try {
      mtime = statSync(this.path).mtimeMs;
    } catch {
      // No file: nobody is banned.
    }
    if (mtime === this.mtime) return;
    this.mtime = mtime;
    this.keys = new Set();
    this.ips = new BlockList();
    if (!mtime) return;
    // A list the door can't read (a directory, no permission) bans nobody rather than crashing
    // every connection that checks it.
    let text: string;
    try {
      text = readFileSync(this.path, "utf8");
    } catch {
      return this.warn(`(${this.path} can't be read)`);
    }
    for (const raw of text.split("\n")) {
      const entry = raw.replace(/#.*/, "").trim();
      if (!entry) continue;
      if (entry.startsWith("SHA256:")) {
        this.keys.add(entry);
        continue;
      }
      const [net, bits] = entry.split("/");
      const family = isIP(net ?? "");
      const type = family === 4 ? "ipv4" : "ipv6";
      const prefix = Number(bits);
      if (family && bits === undefined) this.ips.addAddress(net!, type);
      // BlockList throws on a prefix longer than the address (10.0.0.0/33).
      else if (family && /^\d+$/.test(bits ?? "") && prefix <= (family === 4 ? 32 : 128)) this.ips.addSubnet(net!, prefix, type);
      else this.warn(entry);
    }
  }
}
