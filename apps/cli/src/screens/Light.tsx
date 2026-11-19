import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { serverHost } from "@beaconsgg/client-sdk";
import { coverageLabel, FIRE_TUNING, MOVE_TEXT, serverLabel, uncoveredText, type ServerStatus } from "@watchfire/core";
import type { Game } from "../game.ts";
import type { Session, WatchPlace } from "../session.ts";
import { cell, Frame, grow, Message, pointer, stepCursor, TextInput, useSize } from "../ui.tsx";
import { CityPicker } from "./CityPicker.tsx";

/** Light a new fire: where, on which server (when more than one would take it), then its name. */
export function Light(props: { game: Game; session: Session; lit(id: string): void; back(): void }) {
  const { game, session } = props;
  const [where, setWhere] = useState<WatchPlace | null>(null);
  const [server, setServer] = useState<ServerStatus | null>(null);

  const blocked = game.isGuest ? game.guestHint : game.logsLeft === 0 ? MOVE_TEXT.outOfLogs : null;
  const targets = useMemo(() => (where ? game.lightTargets(where) : []), [where, game.servers]);
  // One server that would take it: no need to ask.
  const chosen = server ?? (targets.length === 1 ? targets[0]! : null);

  let body;
  if (blocked) {
    body = (
      <>
        <Text color="#a8a29e">{blocked}</Text>
        <BackOnAnyKey back={props.back} />
      </>
    );
  } else if (!where) {
    body = (
      <>
        <Text color="#a8a29e">
          Lighting a fire costs a log. It will burn {FIRE_TUNING.baseSec / 3600} hours on its own; every log adds{" "}
          {FIRE_TUNING.secPerLog / 3600} more.
        </Text>
        <Box marginTop={1}>
          <CityPicker
            prompt="Where?"
            {...(game.keeper.watch ? { fallback: game.keeper.watch } : {})}
            onPick={setWhere}
            onCancel={props.back}
          />
        </Box>
      </>
    );
  } else if (targets.length === 0) {
    body = (
      <>
        <Text color="#a8a29e">{uncoveredText(where.label)}</Text>
        <Text color="#78716c" wrap="wrap">
          A server takes fires only inside the area it covers. Servers you only watch, and members-only servers you haven't
          joined, take none of yours. Add or change servers under Servers (S on the main screen).
        </Text>
        <BackOnAnyKey back={() => setWhere(null)} label="Press any key to choose another place." />
      </>
    );
  } else if (!chosen) {
    body = <ServerPicker where={where} targets={targets} onPick={setServer} onCancel={() => setWhere(null)} />;
  } else {
    body = (
      <>
        <Text color="#a8a29e">
          Near {where.label}, on <Text color="#fde68a">{serverLabel(chosen)}</Text>.
        </Text>
        <Box marginTop={1}>
          <TextInput
            label="Name it:"
            initial={`The fire at ${where.name}`}
            max={48}
            onCancel={() => (targets.length > 1 ? setServer(null) : setWhere(null))}
            onSubmit={async (name) => {
              if (game.busy) return;
              const lit = await game.light(where, name.trim() || `The fire at ${where.name}`, chosen.origin);
              if (lit) props.lit(lit.id);
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text color="#78716c">Enter to light · Ctrl+U to clear · Esc to go back a step</Text>
        </Box>
        <Message text={game.message} busy={game.busy} />
      </>
    );
  }

  return (
    <Frame node={session.node} title="STRIKE A LIGHT">
      {body}
    </Frame>
  );
}

/** Choose the server for a new fire. The first is the default: the most specific coverage. */
function ServerPicker(props: { where: WatchPlace; targets: ServerStatus[]; onPick(s: ServerStatus): void; onCancel(): void }) {
  const [sel, setSel] = useState(0);
  const { width } = useSize();
  useInput((_, key) => {
    if (key.escape) return props.onCancel();
    if (key.return) return props.onPick(props.targets[sel]!);
    setSel((s) => stepCursor(key, s, props.targets.length));
  });
  const nameW = grow(24, width, 0.3, 40);
  const hostW = grow(20, width, 0.3, 40);
  return (
    <>
      <Text color="#a8a29e">
        {props.targets.length} of your servers would take a fire near {props.where.label}. Which one holds it?
      </Text>
      <Text color="#78716c">The fire lives on that server: players who read it see the fire, and keepers need to play there.</Text>
      <Box marginTop={1} flexDirection="column">
        {props.targets.map((s, i) => (
          <Text key={s.origin} color={i === sel ? "#fbbf24" : undefined} wrap="truncate-end">
            {pointer(i === sel)}
            {cell(serverLabel(s), nameW)} {cell(serverHost(s.host, s.origin), hostW)} {cell(coverageLabel(s.coverage), 10)}
            <Text color="#78716c">
              {s.ms != null ? `${s.ms} ms` : ""}
              {i === 0 ? "  (default: covers this place most closely)" : ""}
            </Text>
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color="#78716c">↑↓ choose · Enter pick · Esc another place</Text>
      </Box>
    </>
  );
}

function BackOnAnyKey(props: { back(): void; label?: string }) {
  useInput(() => props.back());
  return <Text color="#78716c">{props.label ?? "Press any key."}</Text>;
}
