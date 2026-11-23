// The settings the door and its website share, from the environment (see docs/ssh-door.md).

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SERVERS, DOWNLOAD_URL } from "@watchfire/core";
import { numberSetting, setting } from "./env.ts";

/** The game's ssh port; 0 for no door, the website alone. */
export const PORT = numberSetting("WATCHFIRE_DOOR_PORT", 2222);
export const BIND = setting("WATCHFIRE_DOOR_BIND") ?? "0.0.0.0";
export const SERVERS = setting("WATCHFIRE_SERVERS")?.split(",").filter(Boolean) ?? [...DEFAULT_SERVERS];
export const WRITES_PER_MINUTE = numberSetting("WATCHFIRE_DOOR_WRITES_PER_MINUTE", 100);
/** The website (the dashboard and its /api/world): its port, 0 for none. */
export const WEB_PORT = numberSetting("WATCHFIRE_WEB_PORT", 8080);
export const WEB_ROOT = resolve(setting("WATCHFIRE_WEB_ROOT") ?? fileURLToPath(new URL("../../dashboard/dist/", import.meta.url)));
/** The port players dial, when it isn't the one the door listens on (Docker maps it). */
export const PUBLIC_PORT = numberSetting("WATCHFIRE_DOOR_PUBLIC_PORT", PORT);
/** The join command the website shows; by default worked out from the address the visitor used. */
export const JOIN = setting("WATCHFIRE_JOIN");
/** Where the website sends players to download the game: the latest release, unless set ("none" for no link). */
const download = setting("WATCHFIRE_DOWNLOAD") ?? DOWNLOAD_URL;
export const DOWNLOAD = download === "none" ? null : download;
/** Testing only: another room type, invisible to normal play. */
const fireType = setting("WATCHFIRE_FIRE_TYPE");
export const FIRE_TYPE: { type?: string } = fireType ? { type: fireType } : {};
