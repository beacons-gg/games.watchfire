import { useState } from "react";
import { Box, Text, useAnimation, useInput } from "ink";
import { clock, formatDuration, safeText } from "@watchfire/core";
import type { Game } from "../game.ts";
import type { OnlineNode, Page, Session } from "../session.ts";
import { cell, Frame, grow, Keys, Message, nodeLabel, pointer, stepCursor, TextInput, useSize } from "../ui.tsx";

/** How a page reads when it arrives. */
export const pageText = (p: Page) => `Page from ${safeText(p.name, 40)} on node ${nodeLabel(p.from)}: ${safeText(p.text, 120)}`;

/** The door's "who's online": every connected node, like a BBS. Keepers can page one. */
export function Online(props: { game: Game; session: Session; back(): void }) {
  const { game, session } = props;
  const door = session.door;
  const { width, height } = useSize();
  const [sel, setSel] = useState(0);
  const [paging, setPaging] = useState<OnlineNode | null>(null);
  // Nothing else re-renders this screen, so look again now and then: arrivals, leavers, "On for".
  useAnimation({ interval: 5_000 });

  const nodes = (door?.online() ?? []).sort((a, b) => a.node - b.node);
  const at = Math.min(sel, Math.max(0, nodes.length - 1));
  const target = nodes[at];
  const canPage = !!door?.page && !!target && target.node !== session.node;

  useInput(
    (input, key) => {
      const k = input.toLowerCase();
      if (key.escape || k === "q") return props.back();
      if (k === "p") {
        if (!door?.page) return game.setMessage(game.guestHint);
        if (target?.node === session.node) return game.setMessage("That's you.");
        if (target) return setPaging(target);
      }
      setSel(stepCursor(key, at, nodes.length));
    },
    { isActive: paging === null },
  );

  const pages = door?.pages() ?? [];
  const nameW = grow(24, width, 0.3, 40);
  // The pages box takes its lines plus a heading and a gap.
  const rows = Math.max(3, height - 14 - (pages.length > 0 ? pages.length + 2 : 0));
  // Scroll so the chosen node is always on screen.
  const top = Math.max(0, at - rows + 1);
  return (
    <Frame
      node={session.node}
      title="WHO'S ONLINE"
      footer={
        paging !== null ? (
          <Text color="#78716c">Enter to send · Esc to cancel</Text>
        ) : (
          <Keys
            keys={[
              ["↑↓", " choose"],
              ["P", "age", !canPage],
              ["Esc", " back"],
            ]}
          />
        )
      }
    >
      <Text color="#a8a29e">{nodes.length} on the line</Text>
      <Text color="#78716c">
        {"  "}
        {cell("Node", 6)}
        {cell("Who", nameW)} {cell("On for", 8)} Doing
      </Text>
      <Box flexDirection="column" flexGrow={1}>
        {nodes.slice(top, top + rows).map((n, i) => (
          <Text key={n.node} wrap="truncate-end" color={top + i === at ? "#fbbf24" : undefined}>
            {pointer(top + i === at)}
            {cell(nodeLabel(n.node), 6)}
            {cell(n.name + (n.node === session.node ? " (you)" : ""), nameW)} {cell(formatDuration((Date.now() - n.since) / 1000), 8)}
            <Text color="#a8a29e">{n.activity}</Text>
          </Text>
        ))}
      </Box>
      {pages.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="#78716c">Pages to you</Text>
          {pages.map((p) => (
            <Text key={`${p.at}:${p.from}:${p.text}`} wrap="truncate-end">
              <Text color="#78716c">{clock(p.at / 1000)} </Text>
              {pageText(p)}
            </Text>
          ))}
        </Box>
      ) : null}
      {paging !== null ? (
        <Box marginTop={1}>
          <TextInput
            label={`Page ${safeText(paging.name, 40)} on node ${nodeLabel(paging.node)}:`}
            max={120}
            onCancel={() => setPaging(null)}
            onSubmit={(text) => {
              setPaging(null);
              if (!safeText(text)) return;
              game.setMessage(door?.page?.(paging, text) ?? `Paged ${safeText(paging.name, 40)}.`);
            }}
          />
        </Box>
      ) : null}
      <Message text={game.message} />
    </Frame>
  );
}
