import { Box, Text, useInput } from "ink";
import { FIRE_TUNING, LOGS_PER_DAY } from "@watchfire/core";
import type { Session } from "../session.ts";
import { Frame, Keys } from "../ui.tsx";

const h = (s: number) => `${s / 3600}h`;

export function Help(props: { session: Session; back(): void }) {
  useInput(() => props.back());
  const t = FIRE_TUNING;
  return (
    <Frame node={props.session.node} title="HOW THE FIRES BURN" footer={<Keys keys={[["any key", " back"]]} />}>
      <Box flexDirection="column">
        <Text>Fires burn at real places around the world. Keep them alive.</Text>
        <Text> </Text>
        <Text>• You get <Text color="#fbbf24">{LOGS_PER_DAY} logs a day</Text>. Lay them on any fire, or spend one to light a new fire.</Text>
        <Text>• A new fire burns <Text color="#fbbf24">{h(t.baseSec)}</Text> on its own. Every log adds <Text color="#fbbf24">{h(t.secPerLog)}</Text>.</Text>
        <Text>• A fire holds {t.capacity} logs at most, so every fire goes dark within {h(t.baseSec + t.capacity * t.secPerLog)}.</Text>
        <Text>• Lay a log and you're one of its <Text color="#fde68a">keepers</Text>.</Text>
        <Text>• Once a fire holds {t.emberAt} logs, each keeper may take <Text color="#f97316">one ember</Text>.</Text>
        <Text>• When it goes dark, keepers can rake their logs from the ashes.</Text>
        <Text>• Anyone can warm their hands at a fire, once.</Text>
        <Text> </Text>
        <Text color="#a8a29e">One keeper can carry a fire into tomorrow. It takes two to keep pace with the clock.</Text>
        <Text> </Text>
        <Text color="#78716c">The rules live in each fire on its Beacon server, which enforces them for everyone.</Text>
        <Text color="#78716c">City names from GeoNames (geonames.org), CC BY 4.0.</Text>
      </Box>
    </Frame>
  );
}
