import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { stamp } from "@watchfire/core";
import type { Game } from "../game.ts";
import type { Session } from "../session.ts";
import { Frame, Keys, stepCursor, useSize } from "../ui.tsx";

/** The news log, newest first. Lines from before this visit's first look are marked. */
export function News(props: { game: Game; session: Session; back(): void }) {
  const { game, session } = props;
  const lines = [...game.news].reverse();
  const ROWS = Math.max(5, useSize().height - 7);
  const [top, setTop] = useState(0);

  useInput((input, key) => {
    if (key.escape || input.toLowerCase() === "q") return props.back();
    // Scroll the top line, so the last page stays full.
    setTop((t) => stepCursor(key, t, lines.length - ROWS + 1, ROWS));
  });

  return (
    <Frame node={session.node} title="THE WATCH LOG" footer={<Keys keys={[["↑↓", " scroll"], ["Esc", " back"]]} />}>
      <Box flexDirection="column" flexGrow={1}>
        {lines.length === 0 ? <Text color="#78716c">Nothing to report. The fires burn quietly.</Text> : null}
        {lines.slice(top, top + ROWS).map((l, i) => (
          <Text key={`${l.fireId}${l.kind}${l.at}${i}`} wrap="truncate-end">
            <Text color="#78716c">{stamp(l.at)} </Text>
            <Text color={l.kind === "dark" ? "#a8a29e" : l.kind === "lit" ? "#fbbf24" : undefined}>{l.text}</Text>
          </Text>
        ))}
      </Box>
    </Frame>
  );
}
