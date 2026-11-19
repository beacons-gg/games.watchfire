import { Box, Text, useAnimation, useInput } from "ink";
import { formatDuration } from "@watchfire/core";
import type { Session } from "../session.ts";
import { cell, Frame, grow, Keys, nodeLabel, useSize } from "../ui.tsx";

/** The door's "who's online": every connected node, like a BBS. */
export function Online(props: { session: Session; back(): void }) {
  const { session } = props;
  const { width } = useSize();
  // Nothing else re-renders this screen, so look again now and then: arrivals, leavers, "On for".
  useAnimation({ interval: 5_000 });
  useInput((input, key) => {
    if (key.escape || input.toLowerCase() === "q") props.back();
  });
  const nodes = (session.door?.online() ?? []).sort((a, b) => a.node - b.node);
  const nameW = grow(24, width, 0.3, 40);
  return (
    <Frame node={session.node} title="WHO'S ONLINE" footer={<Keys keys={[["Esc", " back"]]} />}>
      <Text color="#a8a29e">
        {nodes.length} on the line
      </Text>
      <Text color="#78716c">
        {cell("Node", 6)}
        {cell("Who", nameW)} {cell("On for", 8)} Doing
      </Text>
      <Box flexDirection="column" flexGrow={1}>
        {nodes.map((n) => (
          <Text key={n.node} wrap="truncate-end" color={n.node === session.node ? "#fbbf24" : undefined}>
            {cell(nodeLabel(n.node), 6)}
            {cell(n.name, nameW)} {cell(formatDuration((Date.now() - n.since) / 1000), 8)}
            <Text color="#a8a29e">{n.activity}</Text>
          </Text>
        ))}
      </Box>
    </Frame>
  );
}
