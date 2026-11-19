// The sysop's commands: the announcement, the ban list, and moving a door's files into a database.
// They work on whichever store the door's settings name, so they're the same for files and Postgres.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { banOf, entryOf } from "./bans.ts";
import { openStore, type DoorStore } from "./store.ts";

const HELP = `Sysop commands (in Docker: docker compose exec door node door.mjs <command>):

  motd                     show the announcement every player sees as they arrive
  motd "<text>"            set it (motd "" clears it)
  bans                     show the ban list
  ban <entry> [why]        ban an SSH key (SHA256:..., from the logs), an address or a range (CIDR)
  unban <entry>            lift a ban
  import <folder>          copy a door kept in files (its data folder) into the database

Bans take effect within 10 seconds: anyone on who matches is shown out.`;

/** Run one command. Resolves to the exit code. */
export async function sysop(command: string, args: string[], out: (line: string) => void = console.log): Promise<number> {
  if (command === "help" || command === "--help" || command === "-h") {
    out(HELP);
    return 0;
  }
  const run = COMMANDS[command];
  if (!run) {
    out(`No command "${command}".\n\n${HELP}`);
    return 2;
  }
  const store = await openStore();
  try {
    return await run(store, args, out);
  } finally {
    await store.close();
  }
}

type Command = (store: DoorStore, args: string[], out: (line: string) => void) => Promise<number>;

const COMMANDS: Record<string, Command> = {
  motd: async (store, args, out) => {
    if (!args.length) {
      out((await store.text("motd")).trim() || "(no announcement)");
      return 0;
    }
    const text = args.join(" ").trim();
    await store.setText("motd", text ? `${text}\n` : "");
    out(text ? "Announcement set. Players arriving from now on see it (within 10 seconds)." : "Announcement cleared.");
    return 0;
  },

  bans: async (store, _args, out) => {
    out((await store.text("bans")).trim() || "(nobody is banned)");
    return 0;
  },

  ban: async (store, [entry = "", ...why], out) => {
    if (!banOf(entry)) {
      out(`"${entry}" isn't an SSH key (SHA256:..., as the logs show it), an address or a range (203.0.113.0/24).`);
      return 2;
    }
    const lines = await banLines(store);
    if (lines.some((l) => entryOf(l) === entry)) {
      out(`${entry} is banned already.`);
      return 0;
    }
    const reason = why.join(" ").replace(/\s+/g, " ").trim();
    await saveBans(store, [...lines, reason ? `${entry}  # ${reason}` : entry]);
    out(`Banned ${entry}. Within 10 seconds, anyone on who matches is shown out.`);
    return 0;
  },

  unban: async (store, [entry = ""], out) => {
    if (!entry) {
      out("unban what? Give the entry as the list shows it (door.mjs bans).");
      return 2;
    }
    const lines = await banLines(store);
    const kept = lines.filter((l) => entryOf(l) !== entry);
    if (kept.length === lines.length) {
      out(`${entry} isn't on the ban list.`);
      return 1;
    }
    await saveBans(store, kept);
    out(`Lifted the ban on ${entry}.`);
    return 0;
  },

  import: async (store, [folder = ""], out) => {
    if (store.kind !== "postgres") {
      out("import copies a door's files into its database: set WATCHFIRE_DOOR_DATABASE_URL first.");
      return 2;
    }
    const home = resolve(folder);
    if (!folder || !(existsSync(join(home, "host_key")) || existsSync(join(home, "keepers")))) {
      out(`${folder || "(no folder given)"} doesn't look like a door's data folder (no host_key, no keepers/).`);
      return 2;
    }
    const { keepers, found } = await store.importFiles(home);
    out(`Copied ${keepers} keeper${keepers === 1 ? "" : "s"}${found.length ? ` and ${found.join(", ")}` : ""} into ${store.where}.`);
    // A door kept in files may have made its own master key: its keepers open with that one only.
    if (existsSync(join(home, "master.key"))) {
      out(`This door made its own master key, ${join(home, "master.key")}: the keepers open only with it. Give the database door`);
      out("that key (WATCHFIRE_MASTER_KEY, the file's contents), not a new one, or every keeper is lost.");
    }
    out("Restart the door to pick up the host key: docker compose restart door");
    return 0;
  },
};

/** The ban list's lines, blank ones dropped. */
const banLines = async (store: DoorStore) => (await store.text("bans")).split("\n").filter((l) => l.trim());
const saveBans = (store: DoorStore, lines: string[]) => store.setText("bans", lines.length ? lines.join("\n") + "\n" : "");
