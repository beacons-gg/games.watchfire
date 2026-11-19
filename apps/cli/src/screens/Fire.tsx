import { useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { serverHost } from "@beaconsgg/client-sdk";
import { accessLabel, ago, clock, lastSeenText, serverLabel, distanceKm, FIRE_TUNING, formatDistance, formatDuration, safeText, type Units } from "@watchfire/core";
import type { Game } from "../game.ts";
import type { Session } from "../session.ts";
import { strengthFor } from "@watchfire/core/flame";
import { BurnBar, FlameView, Frame, grow, Keys, Message, useSize } from "../ui.tsx";

export function Fire(props: { game: Game; session: Session; fireId: string; back(): void }) {
  const { game, session, fireId } = props;
  const f = game.fires.find((x) => x.id === fireId);
  const me = game.me;
  const { width, height } = useSize();
  const flameRows = Math.max(4, Math.min(12, height - 20));

  // Watch this fire live while it's open, and read it fresh on the way in.
  useEffect(() => {
    void game.refreshFire(fireId);
    return game.watchFire(fireId);
  }, [fireId]);

  // Look up the names of the people at this fire.
  useEffect(() => {
    if (f) game.wantNames([f.lighter, ...f.keepers]);
  }, [f?.lighter, f?.keepers.length]);

  useInput((input, key) => {
    if (key.escape || key.backspace || input.toLowerCase() === "q") return props.back();
    if (game.busy || !f) return;
    const k = input.toLowerCase();
    if (k === "f") return void game.feed(fireId);
    if (k === "w") return void game.warm(fireId);
    if (k === "e") return void game.takeEmber(fireId);
    if (k === "r") return void game.rake(fireId);
  });

  if (!f) {
    return (
      <Frame node={session.node} footer={<Keys keys={[["Esc", " back"]]} />}>
        <Text color="#a8a29e">{game.status === "ready" ? "That fire is gone." : "Looking for the fire…"}</Text>
        <Message text={game.message} busy={game.busy} />
      </Frame>
    );
  }

  const burning = f.phase === "burning";
  const isKeeper = !!me && f.keepers.includes(me);
  const hasEmber = !!me && f.emberHolders.includes(me);
  const full = f.logs >= FIRE_TUNING.capacity;
  // A guest, or a fire on a server the player only watches, can't make any move here.
  // A guest, or a fire on a server the player can't act on (watching, not a member, down).
  const reason = game.readOnlyReason(fireId);
  const readOnly = game.isGuest || reason !== null;
  const server = game.serverOf(fireId);
  const seen = game.lastSeen(fireId);
  const off = (move: Parameters<Game["blocker"]>[0]) => readOnly || game.blocker(move, f) !== null;

  const watch = game.keeper.watch;
  const place = game.nearOf(f.id);
  const keepers = f.keepers.map((d) => (d === me ? "you" : game.nameOf(d)));
  const showN = grow(5, width, 0.06, 12);
  const shown = keepers.slice(0, showN).join(", ") + (keepers.length > showN ? ` and ${keepers.length - showN} more` : "");

  let ember: string;
  if (hasEmber) ember = "You carry an ember from this fire.";
  else if (!burning) ember = "Ash gives no embers.";
  else if (f.logs < FIRE_TUNING.emberAt) ember = `Embers at ${FIRE_TUNING.emberAt} logs (${FIRE_TUNING.emberAt - f.logs} to go).`;
  else if (isKeeper) ember = "An ember is yours for the taking: press E.";
  else ember = "Embers are for keepers. Lay a log to become one.";

  return (
    <Frame
      node={session.node}
      title={safeText(f.name, 60)}
      footer={
        <Keys
          keys={[
            ["F", "eed", off("feed")],
            ["W", "arm hands", off("warm")],
            ["E", "mber", off("ember")],
            ["R", "ake ashes", off("rake")],
            ["Esc", " back"],
          ]}
        />
      }
    >
      <Text color="#a8a29e" wrap="truncate-end">
        {place ? `near ${place}` : " "}
        {watch ? ` · ${awayFrom(distanceKm(watch, f.location), game.units)}` : ""}
      </Text>
      {seen !== null ? (
        <Text color="#fde68a" wrap="truncate-end">
          {lastSeenText(server, ago(seen))}
        </Text>
      ) : server ? (
        <Text color="#78716c" wrap="truncate-end">
          on <Text color="#a8a29e">{serverLabel(server)}</Text> ({serverHost(server.host, server.origin)}
          {server.mode === "watch" ? ", watching" : ""}
          {accessLabel(server) !== "open" ? `, ${accessLabel(server)}` : ""})
        </Text>
      ) : null}
      <FlameView rows={flameRows} strength={strengthFor(f.secondsLeft, f.phase)} depth={session.colorDepth} />
      <Text>
        {burning ? (
          <>
            <BurnBar secondsLeft={f.secondsLeft} width={grow(16, width, 0.15, 32)} /> <Text bold>burning</Text>
            <Text color="#a8a29e"> · out in </Text>
            {formatDuration(f.secondsLeft)}
            <Text color="#a8a29e"> (at {clock(f.outAt)})</Text>
          </>
        ) : (
          <>
            <BurnBar secondsLeft={0} ash width={grow(16, width, 0.15, 32)} /> <Text color="#78716c" bold>dark</Text>
            <Text color="#a8a29e">
              {" "}
              since {clock(f.outAt)} · burned {formatDuration(f.outAt - f.placedAt)}
            </Text>
          </>
        )}
      </Text>
      <Text color="#a8a29e">
        {f.logs}/{FIRE_TUNING.capacity} logs{full && burning ? " (full)" : ""} · lit by{" "}
        <Text color="#fde68a">{f.lighter === me ? "you" : game.nameOf(f.lighter)}</Text> {ago(f.placedAt)} ·{" "}
        {f.warmth} warmed their hands
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text wrap="truncate-end">
          <Text color="#a8a29e">Keepers: </Text>
          {shown || "none yet"}
        </Text>
        <Text color="#a8a29e">{ember}</Text>
        {game.blocker("rake", f) === null ? <Text color="#a8a29e">Your logs lie in the ashes. Press R to rake them out.</Text> : null}
        {game.isGuest ? (
          <Text color="#78716c">{game.guestHint}</Text>
        ) : reason ? (
          <Text color="#78716c">{reason}</Text>
        ) : null}
      </Box>
      <Box marginTop={1} flexGrow={1} alignItems="flex-end">
        <Message text={game.message} busy={game.busy} />
      </Box>
    </Frame>
  );
}

const awayFrom = (km: number, units: Units) => (km < 1 ? "right where you keep watch" : `${formatDistance(km, units)} from you`);
