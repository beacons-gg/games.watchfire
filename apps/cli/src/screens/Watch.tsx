import { Box, Text } from "ink";
import { LOGS_PER_DAY, uncoveredText } from "@watchfire/core";
import type { Game } from "../game.ts";
import type { Session, WatchPlace } from "../session.ts";
import { FlameView, Frame } from "../ui.tsx";
import { CityPicker } from "./CityPicker.tsx";

/** Choose where you keep watch: first run, or P from the main screen. */
export function Watch(props: { game: Game; session: Session; firstRun: boolean; done(place?: WatchPlace): void }) {
  const { game, session } = props;
  return (
    <Frame node={session.node} title={props.firstRun ? "W A T C H F I R E" : "WHERE YOU KEEP WATCH"}>
      {props.firstRun ? (
        <>
          <FlameView rows={3} strength={0.8} depth={session.colorDepth} />
          <Text>Somewhere in the world, a fire is about to go out.</Text>
          <Text color="#a8a29e">You'll get {LOGS_PER_DAY} logs a day to keep fires burning. First, tell us where you are.</Text>
        </>
      ) : (
        <Text color="#a8a29e">Your nearest fires are measured from here. You can still light fires anywhere.</Text>
      )}
      <Box marginTop={1}>
        <CityPicker
          prompt="Where do you keep watch?"
          {...(game.keeper.watch ? { fallback: game.keeper.watch } : {})}
          onPick={async (p) => {
            await game.setWatch(p);
            props.done(p);
            if (game.uncovered(p)) {
              game.setMessage(`${uncoveredText(p.name)} You can still keep watch from there.`);
            }
          }}
          onCancel={() => props.done()}
        />
      </Box>
    </Frame>
  );
}
