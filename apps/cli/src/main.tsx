#!/usr/bin/env node
import { render } from "ink";
import { loadOrCreateWallet, loadWallet, revealRecoveryPhrase, importWalletFromPhrase } from "@beaconsgg/client-sdk";
import { DEFAULT_SERVERS } from "@watchfire/core";
import { App } from "./app.tsx";
import { configDir, detectColorDepth, fileKeeperStore, fileKeyStore } from "./local.ts";
import { emptyKeeper, localDay, memoryKeeperStore, type KeeperState, type Session } from "./session.ts";
import { createInterface } from "node:readline/promises";
import pkg from "../package.json" with { type: "json" };

// From package.json, so a release tag has one number to match.
const VERSION = pkg.version;

/** A watch-only session starts from the keeper's watch place and server list (pins included). */
const guestStart = ({ watch, servers }: KeeperState): KeeperState => ({
  ...emptyKeeper(),
  ...(watch ? { watch } : {}),
  ...(servers ? { servers } : {}),
});

const HELP = `watchfire ${VERSION}: a door game on Beacon. Keep the fires burning.

Usage:
  watchfire                 play
  watchfire phrase          show your keeper's 12-word recovery phrase
  watchfire import          restore a keeper from a recovery phrase
  watchfire --server <url>  play on another Beacon server (repeatable)
  watchfire --watch-only    look around as a guest, without your keeper
  watchfire --help | --version

Your keeper lives in ${configDir()} (override with WATCHFIRE_HOME).
City names from GeoNames (https://www.geonames.org), CC BY 4.0.`;

async function main(argv: string[]) {
  const servers: string[] = [];
  const rest: string[] = [];
  let watchOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--server" || a === "-s") servers.push(argv[++i] ?? "");
    else if (a === "--watch-only") watchOnly = true;
    else if (a === "--help" || a === "-h") return console.log(HELP);
    else if (a === "--version" || a === "-v") return console.log(VERSION);
    else rest.push(a);
  }
  const keys = await fileKeyStore();

  if (rest[0] === "phrase") {
    const phrase = await revealRecoveryPhrase(keys);
    if (!phrase) return console.log("No keeper yet. Run `watchfire` to make one.");
    console.log("Your keeper's recovery phrase. Anyone with these words can play as you:\n");
    console.log(`  ${phrase}\n`);
    console.log("Write it down and keep it somewhere safe.");
    return;
  }

  if (rest[0] === "import") {
    if (await loadWallet(keys)) {
      console.error(`A keeper already lives in ${configDir()}. Move that folder away first.`);
      process.exitCode = 1;
      return;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const phrase = (await rl.question("Recovery phrase (12 words): ")).trim().toLowerCase().split(/\s+/).join(" ");
    rl.close();
    const w = await importWalletFromPhrase(phrase, keys);
    console.log(`Welcome back. Your keeper's account is ${w.account.did}.`);
    return;
  }

  if (rest.length) {
    console.error(`Unknown command: ${rest.join(" ")}\n\n${HELP}`);
    process.exitCode = 2;
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("watchfire needs an interactive terminal.");
    process.exitCode = 2;
    return;
  }

  const session: Session = {
    wallet: watchOnly ? null : await loadOrCreateWallet(keys),
    // A guest's state lives only for the session, starting from the keeper's place and servers.
    store: watchOnly ? memoryKeeperStore(guestStart(await (await fileKeeperStore()).load())) : await fileKeeperStore(),
    defaultServers: process.env.WATCHFIRE_SERVERS?.split(",").filter(Boolean) ?? [...DEFAULT_SERVERS],
    ...(servers.length ? { fixedServers: servers } : {}),
    node: 1,
    colorDepth: detectColorDepth(),
    today: () => localDay(),
    keyHint: configDir(),
    ...(watchOnly ? { guestHint: "You're only watching. Run watchfire without --watch-only to play." } : {}),
    ...(process.env.WATCHFIRE_FIRE_TYPE ? { fireType: process.env.WATCHFIRE_FIRE_TYPE } : {}),
  };

  const app = render(<App session={session} />, { alternateScreen: true, maxFps: 20, incrementalRendering: true });
  await app.waitUntilExit();
  console.log("The fires burn on without you. Come back tomorrow.");
  process.exit(0);
}

main(process.argv.slice(2)).catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
