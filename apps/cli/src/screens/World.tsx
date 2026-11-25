import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { capacityOf, distanceKm, formatDistance, hostOf, safeText, serverLabel } from "@watchfire/core";
import type { Game } from "../game.ts";
import type { Session } from "../session.ts";
import { BurnBar, cell, Frame, grow, Keys, Message, placeCell, pointer, stepCursor, TimeLeft, useSize } from "../ui.tsx";

/**
 * Every burning fire, the closest to going out first; then the dark ones this keeper can still
 * rake (a dark fire is nothing to anyone else). F narrows it to one server.
 */
export function World(props: { game: Game; session: Session; open(id: string): void; back(): void }) {
  const { game, session } = props;
  const [sel, setSel] = useState(0);
  // The host to show fires from, or null for every server.
  const [only, setOnly] = useState<string | null>(null);
  const { width, height } = useSize();
  const ROWS = Math.max(5, height - 9);
  // Sized so every column, Away ("12,345 km") included, fits 80 columns. The server column only
  // with more than one server (up or not: it's where "not answering" shows); with one, the place
  // gets its room.
  const servers = game.servers.length > 1;
  const serverW = servers ? grow(11, width, 0.15, 26) : 0;
  const nameW = grow(servers ? 18 : 20, width, 0.25, 40);
  const nearW = grow(servers ? 8 : 18, width, 0.35, 56);
  const hosts = game.servers.filter((s) => s.state === "ok" && s.host).map((s) => s.host!);
  const shown = game.fires.filter((f) => f.phase === "burning" || game.blocker("rake", f) === null);
  const list = only ? shown.filter((f) => hostOf(f.id) === only) : shown;
  const watch = game.keeper.watch;

  useInput((input, key) => {
    const k = input.toLowerCase();
    if (key.escape || k === "q") return props.back();
    setSel((s) => stepCursor(key, s, list.length, ROWS));
    if (key.return && list[sel]) props.open(list[sel]!.id);
    if (k === "r") void game.refresh();
    if (k === "f" && game.multiServer) {
      // Cycle: every server, then each one in turn.
      const i = only ? hosts.indexOf(only) : -1;
      setOnly(i + 1 < hosts.length ? hosts[i + 1]! : null);
      setSel(0);
    }
  });

  const top = Math.max(0, Math.min(sel - Math.floor(ROWS / 2), list.length - ROWS));
  const page = list.slice(top, top + ROWS);
  const burning = list.filter((f) => f.phase === "burning").length;

  return (
    <Frame
      node={session.node}
      title="THE WORLD"
      footer={
        <Keys
          keys={[
            ["↑↓", " choose"],
            ["Enter", " visit"],
            ["F", "ilter by server", !game.multiServer],
            ["R", "efresh"],
            ["Esc", " back"],
          ]}
        />
      }
    >
      <Text color="#a8a29e" wrap="truncate-end">
        {burning} burning{list.length > burning ? ` · ${list.length - burning} for you to rake` : ""} · closest to going out first
        {only ? (
          <Text color="#fde68a"> · only {serverLabel(game.servers.find((s) => s.host === only) ?? { origin: only })}</Text>
        ) : game.multiServer ? (
          ` · from ${hosts.length} servers`
        ) : null}
      </Text>
      <Text color="#78716c">
        {"  "}
        {cell("Fire", nameW)} {cell("Near", nearW)} {servers ? `${cell("Server", serverW)} ` : ""}{cell("Burn", 8)} {cell("Left", 7)}{" "}
        {cell("Logs", 8)}
        {watch ? "Away" : ""}
      </Text>
      <Box flexDirection="column" flexGrow={1}>
        {page.map((f, i) => {
          const idx = top + i;
          const ash = f.phase === "ash";
          const stale = game.lastSeen(f.id) !== null;
          return (
            <Text key={f.id} wrap="truncate-end" color={idx === sel ? "#fbbf24" : ash ? "#78716c" : undefined}>
              {pointer(idx === sel)}
              {cell(safeText(f.name), nameW)} {placeCell(game.placeOf(f.id), nearW)}{" "}
              {servers ? `${cell(stale ? "not answering" : game.serverNameOf(f.id), serverW)} ` : ""}
              <BurnBar secondsLeft={f.secondsLeft} ash={ash} width={8} />{" "}
              <TimeLeft secondsLeft={f.secondsLeft} ash={ash} stale={stale} pad={7} />{" "}
              {cell(`${f.logs}/${capacityOf(f)}`, 8)}
              {watch ? formatDistance(distanceKm(watch, f.location), game.units) : ""}
            </Text>
          );
        })}
        {list.length === 0 ? <Text color="#78716c">  {game.status === "ready" ? "No fires anywhere. Yet." : "Looking for fires…"}</Text> : null}
      </Box>
      <Message text={game.message} busy={game.busy} />
    </Frame>
  );
}
