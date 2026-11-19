// The operator of the local test servers (scripts/local-servers): approve players who asked to
// join Members Hall, the way an operator would in the console.
//
//   node scripts/local-operator.ts did                 # the operator DID, for BEACON_ADMINS
//   node scripts/local-operator.ts pending             # who's asked to join
//   node scripts/local-operator.ts approve <did>       # let a player in
//   node scripts/local-operator.ts decline <did>
//
// The operator's phrase lives in .watchfire-dev/operator.json (git-ignored). Local testing only.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@beaconsgg/client-sdk";
import { createRecoveryPhrase, walletFromMnemonic } from "@beaconsgg/identity";

const SERVER = process.env.BEACON ?? "http://localhost:3001";
const file = new URL("../.watchfire-dev/operator.json", import.meta.url);

let phrase: string;
try {
  phrase = JSON.parse(readFileSync(file, "utf8")).phrase;
} catch {
  phrase = createRecoveryPhrase();
  mkdirSync(new URL("../.watchfire-dev/", import.meta.url), { recursive: true });
  writeFileSync(file, JSON.stringify({ phrase }), { mode: 0o600 });
}
const operator = walletFromMnemonic(phrase);
// An operator's envelope carries no game.
const client = createClient();

const [cmd, did] = process.argv.slice(2);
if (cmd === "did") {
  console.log(operator.account.did);
} else if (cmd === "pending") {
  type Entry = { did: string; status: string; note?: string };
  const r = await client.postSignedOrThrow<{ entries?: Entry[]; members?: Entry[] }>(
    SERVER, "/admin/access/fetch", operator, { op: "admin.access.fetch", params: {} },
  );
  for (const e of r.entries ?? r.members ?? []) console.log(`${e.status}\t${e.did}\t${e.note ?? ""}`);
} else if ((cmd === "approve" || cmd === "decline") && did) {
  const op = cmd === "approve" ? "add" : "decline";
  const r = await client.postSignedOrThrow(SERVER, `/admin/access/${op}`, operator, { op: `admin.access.${op}`, params: { did } });
  console.log(`${cmd}d ${did}`, JSON.stringify(r));
} else {
  console.error("usage: node scripts/local-operator.ts did | pending | approve <did> | decline <did>");
  process.exitCode = 2;
}
