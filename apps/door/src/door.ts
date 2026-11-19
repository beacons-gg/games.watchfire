// The Watchfire SSH door. Players `ssh` in and the door runs the Watchfire app in their session.
//
//   pnpm door                      # listens on :2222, data in ./.watchfire-door
//   ssh -p 2222 localhost          # with your SSH key: your keeper. Without: a guest.
//   pnpm door help                 # the sysop's commands: motd, bans, import
//   WATCHFIRE_DOOR_PORT=0 pnpm door   # the website alone, no ssh: for a door elsewhere
//   node door.mjs health          # the container's health check: is it taking calls?
//
// The door has no TTY of its own, so colors would be off: tell chalk the terminals on the other
// end take truecolor before anything loads it.
import { connect } from "node:net";
import { log } from "./env.ts";

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "health") {
    process.exitCode = await health();
  } else if (command) {
    const { sysop } = await import("./sysop.ts");
    process.exitCode = await sysop(command, args);
  } else {
    process.env.FORCE_COLOR ??= "3";
    const { PORT, WEB_PORT } = await import("./settings.ts");
    if (PORT > 0) await import("./server.tsx");
    else if (WEB_PORT > 0) await (await import("./site.ts")).siteAlone();
    else throw new Error("WATCHFIRE_DOOR_PORT and WATCHFIRE_WEB_PORT are both 0: nothing to run");
  }
} catch (e) {
  // One plain line (no master key, no database), not Node's dump of the minified bundle.
  const error = (e as Error)?.message || String(e);
  if (command) console.error(error);
  else log("start-failed", { error });
  process.exit(1);
}

/** 0 when the door (or the website, running alone) takes a connection: a plain TCP connect, which the door doesn't log. */
async function health(): Promise<number> {
  const { PORT, WEB_PORT } = await import("./settings.ts");
  return new Promise((done) => {
    const socket = connect(PORT || WEB_PORT, "127.0.0.1");
    socket.setTimeout(4_000, () => (socket.destroy(), done(1)));
    socket.on("connect", () => (socket.end(), done(0))).on("error", () => done(1));
  });
}
