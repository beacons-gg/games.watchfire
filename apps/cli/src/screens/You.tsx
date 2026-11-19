import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { FIRE_TUNING, MAX_NAME, safeText, shortDate } from "@watchfire/core";
import type { Game } from "../game.ts";
import type { Session } from "../session.ts";
import { Frame, Keys, Message, TextInput, useSize } from "../ui.tsx";

/** The keeper: their name, their record, and their embers. */
export function You(props: { game: Game; session: Session; back(): void }) {
  const { game, session } = props;
  const { height } = useSize();
  const [naming, setNaming] = useState(false);
  // Door only: "take your keeper home" asks first, then shows the phrase.
  const [home, setHome] = useState<null | "ask" | { phrase: string }>(null);
  const revealPhrase = game.isGuest ? undefined : session.door?.revealPhrase;
  const me = game.me;

  useEffect(() => game.wantNames([me ?? undefined]), [game.wantNames, me]);

  useInput(
    (input, key) => {
      const k = input.toLowerCase();
      if (home === "ask") {
        if (k === "y" && revealPhrase) {
          // Only if they're still being asked: a key pressed meanwhile said no. A failure must not
          // reject unhandled, which would bring down the door and every player on it.
          revealPhrase().then(
            (phrase) => setHome((h) => (h === "ask" && phrase ? { phrase } : null)),
            () => setHome(null),
          );
          return;
        }
        return setHome(null);
      }
      if (home) return setHome(null); // any key hides the phrase
      if (key.escape || k === "q") return props.back();
      if (k === "n" && !game.isGuest && !game.busy) setNaming(true);
      if (k === "k" && revealPhrase) setHome("ask");
    },
    { isActive: !naming },
  );

  if (home) {
    return (
      <Frame node={session.node} title="TAKE YOUR KEEPER HOME">
        {home === "ask" ? (
          <>
            <Text>This shows your keeper's recovery phrase: 12 words that are your keeper.</Text>
            <Text color="#a8a29e">With them you can play from your own machine (`watchfire import`) and own your keys.</Text>
            <Text color="#fde68a">Anyone who sees them can play as you. Make sure nobody is watching your screen.</Text>
            <Box marginTop={1}>
              <Text>
                Show it? <Text color="#fbbf24">[Y]</Text>es / any other key: no
              </Text>
            </Box>
          </>
        ) : (
          <>
            <Text color="#a8a29e">Your keeper's recovery phrase:</Text>
            <Box marginY={1} paddingX={2}>
              <Text color="#fde68a" bold>
                {home.phrase}
              </Text>
            </Box>
            <Text color="#a8a29e">On your own machine: `watchfire import`, then type these words.</Text>
            <Text color="#a8a29e">The door keeps a copy too, so both can play as you. Keep the words somewhere safe.</Text>
            <Box marginTop={1}>
              <Text color="#78716c">Any key to hide it.</Text>
            </Box>
          </>
        )}
      </Frame>
    );
  }

  const kept = me ? game.fires.filter((f) => f.keepers.includes(me)) : [];
  const keptBurning = kept.filter((f) => f.phase === "burning").length;
  const embers = [...game.keeper.embers].reverse();
  const rows = Math.max(3, height - 17);

  return (
    <Frame
      node={session.node}
      title="YOUR KEEPER"
      footer={
        naming ? (
          <Text color="#78716c">Enter to save · Esc to cancel</Text>
        ) : (
          <Keys
            keys={[
              ["N", "ame", game.isGuest],
              ...(revealPhrase ? [["K", "eeper home"] as [string, string]] : []),
              ["Esc", " back"],
            ]}
          />
        )
      }
    >
      {game.isGuest ? (
        <Text color="#a8a29e">You're a guest. Guests watch; keepers play.</Text>
      ) : (
        <>
          <Text>
            <Text color="#fde68a" bold>
              {game.nameOf(me ?? undefined)}
            </Text>
            <Text color="#78716c">
              {game.hasProfileName ? "  (your Beacon profile name)" : "  (a keeper name from your key; press N to choose your own)"}
            </Text>
          </Text>
          <Text color="#78716c" wrap="truncate-middle">
            account {me}
          </Text>
        </>
      )}
      <Text color="#a8a29e">
        {embers.length} {embers.length === 1 ? "ember" : "embers"} carried · keeping {keptBurning} burning{" "}
        {keptBurning === 1 ? "fire" : "fires"} · {game.keeper.raked.length} ashes raked
      </Text>
      {naming ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="#a8a29e">Your name goes in your Beacon profile, so other Beacon games can show it too.</Text>
          <TextInput
            label="Your name:"
            initial={game.hasProfileName ? game.nameOf(me ?? undefined) : ""}
            max={MAX_NAME}
            onCancel={() => setNaming(false)}
            onSubmit={async (name) => {
              setNaming(false);
              if (safeText(name)) await game.setName(name);
            }}
          />
        </Box>
      ) : null}
      <Box marginTop={1} flexDirection="column" flexGrow={1}>
        {embers.length === 0 ? (
          <Text color="#78716c">No embers yet. Keep a fire to {FIRE_TUNING.emberAt} logs and take one.</Text>
        ) : (
          embers.slice(0, rows).map((e) => (
            <Text key={e.fireId} wrap="truncate-end">
              <Text color="#f97316">✦ </Text>
              {safeText(e.fireName)}
              <Text color="#78716c"> · {shortDate(e.at)}</Text>
            </Text>
          ))
        )}
        {embers.length > rows ? <Text color="#78716c">…and {embers.length - rows} older</Text> : null}
      </Box>
      {session.keyHint && !game.isGuest ? (
        <Text color="#78716c" wrap="wrap">
          Already have a Beacon account from another game? Quit, move {session.keyHint} aside, and run `watchfire import` with that
          account's recovery phrase.
        </Text>
      ) : null}
      <Message text={game.message} busy={game.busy} />
    </Frame>
  );
}
