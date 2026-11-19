import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { FIRE_TUNING } from "@watchfire/core";
import type { Game } from "../game.ts";
import type { Session, WatchPlace } from "../session.ts";
import { Frame, Message, TextInput } from "../ui.tsx";
import { CityPicker } from "./CityPicker.tsx";

/** Light a new fire: where, then what to call it. Costs a log. */
export function Light(props: { game: Game; session: Session; lit(id: string): void; back(): void }) {
  const { game, session } = props;
  const [where, setWhere] = useState<WatchPlace | null>(null);

  const blocked = game.isGuest
    ? game.guestHint
    : game.logsLeft === 0
      ? "You're out of logs for today. More tomorrow."
      : null;

  return (
    <Frame node={session.node} title="STRIKE A LIGHT">
      {blocked ? (
        <>
          <Text color="#a8a29e">{blocked}</Text>
          <BackOnAnyKey back={props.back} />
        </>
      ) : !where ? (
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
      ) : (
        <>
          <Text color="#a8a29e">Near {where.label}.</Text>
          <Box marginTop={1}>
            <TextInput
              label="Name it:"
              initial={`The fire at ${where.name}`}
              max={48}
              onCancel={() => setWhere(null)}
              onSubmit={async (name) => {
                if (game.busy) return;
                const lit = await game.light(where, name.trim() || `The fire at ${where.name}`);
                if (lit) props.lit(lit.id);
              }}
            />
          </Box>
          <Box marginTop={1}>
            <Text color="#78716c">Enter to light · Esc to choose another place</Text>
          </Box>
          <Message text={game.message} busy={game.busy} />
        </>
      )}
    </Frame>
  );
}

function BackOnAnyKey(props: { back(): void }) {
  useInput(() => props.back());
  return <Text color="#78716c">Press any key.</Text>;
}
