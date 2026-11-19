const ADJ = [
  "Quiet", "Amber", "Patient", "Wandering", "Ashen", "Bright", "Hollow", "Steady", "Restless", "Silver",
  "Smoky", "Gentle", "Iron", "Lantern", "Midnight", "Northern", "Old", "Pale", "Red", "Salt",
  "Sleepless", "Stone", "Sunken", "Tall", "Thorn", "Velvet", "Watchful", "Western", "Wild", "Winter",
  "Cinder", "Copper",
] as const;
const NOUN = [
  "Heron", "Fox", "Moth", "Owl", "Badger", "Crow", "Hare", "Wren", "Stag", "Otter",
  "Lynx", "Raven", "Pike", "Finch", "Marten", "Gull", "Wolf", "Adder", "Kite", "Bear",
  "Lark", "Seal", "Shrike", "Toad", "Vole", "Weasel", "Swift", "Ibis", "Elk", "Crane",
  "Newt", "Bat",
] as const;

/** FNV-1a, enough to spread DIDs over the name table. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A keeper's name, made from their account DID: the same everywhere, for free, with no profile
 * read. Two keepers can share a name; the 4-character tag tells them apart where it matters.
 */
export function keeperName(did: string | undefined, opts: { tag?: boolean } = {}): string {
  if (!did) return "Someone";
  const h = hash(did);
  const name = `${ADJ[h % ADJ.length]} ${NOUN[(h >>> 8) % NOUN.length]}`;
  return opts.tag ? `${name} #${did.slice(-4)}` : name;
}
