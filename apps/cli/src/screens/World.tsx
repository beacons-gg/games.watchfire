import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { distanceKm, FIRE_TUNING, formatDistance, safeText } from "@watchfire/core";
import type { Game } from "../game.ts";
import type { Session } from "../session.ts";
import { BurnBar, cell, Frame, grow, Keys, Message, pointer, stepCursor, TimeLeft, useSize } from "../ui.tsx";

/** Every fire, the closest to going out first; ash at the bottom. */
export function World(props: { game: Game; session: Session; open(id: string): void; back(): void }) {
  const { game, session } = props;
  const [sel, setSel] = useState(0);
  const { width, height } = useSize();
  const ROWS = Math.max(5, height - 9);
  const nameW = grow(24, width, 0.35, 48);
  const nearW = grow(18, width, 0.25, 36);
  const list = game.fires;
  const watch = game.keeper.watch;

  useInput((input, key) => {
    if (key.escape || input.toLowerCase() === "q") return props.back();
    setSel((s) => stepCursor(key, s, list.length, ROWS));
    if (key.return && list[sel]) props.open(list[sel]!.id);
    if (input.toLowerCase() === "r") void game.refresh();
  });

  const top = Math.max(0, Math.min(sel - Math.floor(ROWS / 2), list.length - ROWS));
  const page = list.slice(top, top + ROWS);
  const burning = list.filter((f) => f.phase === "burning").length;

  return (
    <Frame
      node={session.node}
      title="THE WORLD"
      footer={<Keys keys={[["↑↓", " choose"], ["Enter", " visit"], ["R", "efresh"], ["Esc", " back"]]} />}
    >
      <Text color="#a8a29e">
        {burning} burning · {list.length - burning} dark · closest to going out first
      </Text>
      <Text color="#78716c">
        {"  "}
        {cell("Fire", nameW)} {cell("Near", nearW)} {cell("Burn", 8)} {cell("Left", 7)} {cell("Logs", 6)}
        {watch ? "Away" : ""}
      </Text>
      <Box flexDirection="column" flexGrow={1}>
        {page.map((f, i) => {
          const idx = top + i;
          const ash = f.phase === "ash";
          const near = (game.places[f.id] ?? "").split(",")[0] ?? "";
          return (
            <Text key={f.id} wrap="truncate-end" color={idx === sel ? "#fbbf24" : ash ? "#78716c" : undefined}>
              {pointer(idx === sel)}
              {cell(safeText(f.name), nameW)} {cell(near, nearW)} <BurnBar secondsLeft={f.secondsLeft} ash={ash} width={8} />{" "}
              <TimeLeft secondsLeft={f.secondsLeft} ash={ash} pad={7} />{" "}
              {cell(`${f.logs}/${FIRE_TUNING.capacity}`, 6)}
              {watch ? formatDistance(distanceKm(watch, f.location)) : ""}
            </Text>
          );
        })}
        {list.length === 0 ? <Text color="#78716c">  {game.status === "ready" ? "No fires anywhere. Yet." : "Looking for fires…"}</Text> : null}
      </Box>
      <Message text={game.message} busy={game.busy} />
    </Frame>
  );
}
