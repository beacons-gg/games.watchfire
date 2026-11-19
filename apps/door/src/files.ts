import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** A secret the door makes once and keeps (owner-only): its host key, its master key. */
export function readOrCreate(path: string, make: () => string): string {
  if (!existsSync(path)) writeFileSync(path, make(), { mode: 0o600 });
  return readFileSync(path, "utf8");
}
