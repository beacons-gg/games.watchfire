import { Box, Text, useInput } from "ink";
import { ago, distanceKm, FIRE_TUNING, formatDistance, LOGS_PER_DAY, safeText, uncoveredText } from "@watchfire/core";
import type { Game } from "../game.ts";
import type { Session } from "../session.ts";
import { BurnBar, cell, FlameView, Frame, grow, Keys, Message, placeCell, TimeLeft, useSize } from "../ui.tsx";

type MainGo = "world" | "light" | "news" | "you" | "help" | "watch" | "servers" | "online";

export function Main(props: { game: Game; session: Session; go(screen: MainGo): void; open(fireId: string): void; quit(): void }) {
  const { game, session } = props;
  const { width, height } = useSize();
  const flameRows = height >= 40 ? 8 : height >= 30 ? 6 : 4;
  // Dark fires this keeper can still rake (the most recent first): the main list shows only
  // burning fires, so this is the way back to them.
  const ashes = game.fires
    .filter((f) => f.phase === "ash" && game.blocker("rake", f) === null)
    .sort((a, b) => b.outAt - a.outAt);
  // Rows left for the fire list and the news after everything fixed on the screen.
  const free = height - 15 - flameRows - (game.watchUncovered ? 1 : 0) - (ashes.length ? 1 : 0);
  const listRows = Math.max(3, Math.min(9, free));
  const newsRows = Math.max(1, free - listRows + 1);

  const watch = game.keeper.watch;
  const burning = game.fires.filter((f) => f.phase === "burning");
  const dark = game.fires.length - burning.length;
  const nearest = watch
    ? burning
        .map((f) => ({ f, km: distanceKm(watch, f.location) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, listRows)
    : burning.slice(0, listRows).map((f) => ({ f, km: null }));

  useInput((input, key) => {
    if (game.busy) return;
    const k = input.toLowerCase();
    const n = Number(input);
    if (n >= 1 && n <= nearest.length) return props.open(nearest[n - 1]!.f.id);
    if (k === "a" && ashes.length) return props.open(ashes[0]!.id);
    if (k === "w") return props.go("world");
    if (k === "l") return props.go("light");
    if (k === "n") return props.go("news");
    if (k === "y" || k === "e") return props.go("you");
    if (k === "s") return props.go("servers");
    if (k === "o" && session.door) return props.go("online");
    if (k === "p") return props.go("watch");
    if (k === "?" || k === "h") return props.go("help");
    if (k === "r") return void game.refresh();
    if (k === "q" || key.escape) return props.quit();
  });

  const latest = game.news.slice(-newsRows).reverse();
  const strength = game.status !== "ready" ? 0.3 : burning.length === 0 ? 0.12 : 0.55 + Math.min(0.45, burning.length / 40);
  const logDots = "●".repeat(game.logsLeft) + "○".repeat(LOGS_PER_DAY - game.logsLeft);
  // At 80 columns the name, place and bar leave room for "12/12 logs · 12,345 km"; the keepers
  // show from about 100. With several servers, the server's name squeezes the place.
  const nameW = grow(17, width, 0.2, 40);
  const placeW = grow(game.multiServer ? 12 : 16, width, 0.25, 50);
  const barW = grow(8, width, 0.05, 20);
  const serverW = grow(12, width, 0.1, 24);

  return (
    <Frame
      node={session.node}
      footer={
        <Keys
          keys={[
            ...(nearest.length ? [[nearest.length === 1 ? "1" : `1-${nearest.length}`, " visit"] as [string, string]] : []),
            ...(ashes.length ? [["A", "shes"] as [string, string]] : []),
            ["W", "orld"],
            ["L", "ight", game.isGuest],
            ["N", "ews"],
            ["Y", "ou"],
            ["S", "ervers"],
            ...(session.door ? [["O", "nline"] as [string, string]] : []),
            ["P", "lace"],
            ["?", "help"],
            ["Q", "uit"],
          ]}
        />
      }
    >
      <FlameView rows={flameRows} strength={strength} depth={session.colorDepth} />
      <Text wrap="truncate-end">
        {game.status === "connecting" ? (
          <Text color="#a8a29e">Looking for fires…</Text>
        ) : game.status === "offline" ? (
          <Text color="#ef4444">Can't reach any fires: {safeText(game.error ?? "", 80)}. Press S for servers.</Text>
        ) : (
          <>
            <Text color="#fbbf24" bold>
              {burning.length}
            </Text>{" "}
            {burning.length === 1 ? "fire" : "fires"} burning
            {dark > 0 ? <Text color="#78716c"> · {dark} gone dark lately</Text> : null}
            {game.serversNeedingLook > 0 ? (
              <Text color="#fde68a">
                {" "}
                · {game.serversNeedingLook} {game.serversNeedingLook === 1 ? "server needs" : "servers need"} a look (S)
              </Text>
            ) : null}
            {game.freshNews > 0 ? (
              <Text color="#78716c">
                {" "}
                · {game.freshNews} {game.freshNews === 1 ? "thing" : "things"} happened while you were away
              </Text>
            ) : null}
          </>
        )}
      </Text>
      <Text wrap="truncate-end">
        {game.isGuest ? (
          <Text color="#a8a29e">Guest · watching only</Text>
        ) : (
          <>
            <Text color="#fde68a">{game.nameOf(game.me ?? undefined)}</Text>
            {watch ? <Text color="#a8a29e"> · keeping watch from {watch.name}</Text> : null}
            <Text color="#a8a29e"> · logs today </Text>
            <Text color="#fbbf24">{logDots}</Text>
          </>
        )}
      </Text>
      {ashes.length ? (
        <Text color="#fde68a" wrap="truncate-end">
          Your logs lie in the ashes of {safeText(ashes[0]!.name)}
          {ashes.length > 1 ? ` and ${ashes.length - 1} more` : ""}. Press A to rake them out.
        </Text>
      ) : null}
      {game.watchUncovered && watch ? (
        <Text color="#fde68a" wrap="truncate-end">
          {uncoveredText(watch.name)} (S)
        </Text>
      ) : null}
      <Box marginTop={1} flexDirection="column">
        <Text color="#a8a29e">{watch ? "Nearest fires" : "Fires closest to going out"}</Text>
        {nearest.length === 0 && game.status === "ready" ? (
          <Text color="#78716c">  No fires burning. Press L to light the first.</Text>
        ) : null}
        {nearest.map(({ f, km }, i) => {
          const seen = game.lastSeen(f.id);
          return (
            <Text key={f.id} wrap="truncate-end">
              <Text color="#fbbf24">{i + 1}</Text> {cell(safeText(f.name), nameW)}{" "}
              <Text color="#a8a29e">{placeCell(game.placeOf(f.id), placeW)}</Text> <BurnBar secondsLeft={f.secondsLeft} width={barW} />{" "}
              <TimeLeft secondsLeft={f.secondsLeft} stale={seen !== null} pad={8} />
              {game.multiServer ? <Text color="#78716c">{cell(game.serverNameOf(f.id), serverW)} </Text> : null}
              <Text color="#a8a29e">
                {f.logs}/{FIRE_TUNING.capacity} logs
                {km === null ? "" : ` · ${formatDistance(km, game.units)}`} ·{" "}
                {seen !== null ? `last seen ${ago(seen)}` : `${f.keepers.length} kept`}
              </Text>
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1} flexDirection="column" flexGrow={1}>
        {latest.length === 0 ? <Text> </Text> : null}
        {latest.map((l, i) => (
          <Text key={`${l.fireId}${l.kind}${l.at}${i}`} color={i === 0 ? "#a8a29e" : "#78716c"} wrap="truncate-end">
            » {l.text}
          </Text>
        ))}
      </Box>
      <Message text={game.message} busy={game.busy} />
    </Frame>
  );
}
