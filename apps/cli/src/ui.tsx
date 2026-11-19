import { useMemo, useRef, useState, type ReactNode } from "react";
import { Box, Text, Transform, useAnimation, useInput, useWindowSize, type Key } from "ink";
import { DAY_SEC, formatDuration, LOW_SEC, stripControls, URGENT_SEC } from "@watchfire/core";
import { Flame } from "./flame.ts";

/** The smallest screen the layout is designed for; bigger terminals get more of everything. */
export const MIN_WIDTH = 80;
const MIN_HEIGHT = 24;


/** The whole terminal, never smaller than 80×24 (a smaller window clips, as a BBS screen would). */
export function useSize(): { width: number; height: number } {
  const { columns, rows } = useWindowSize();
  return { width: Math.max(MIN_WIDTH, columns || MIN_WIDTH), height: Math.max(MIN_HEIGHT, rows || MIN_HEIGHT) };
}

/** Spread extra space: `base` at 80 columns, plus a share of every column beyond. */
export function grow(base: number, width: number, share: number, max = Infinity): number {
  return Math.min(max, base + Math.floor(Math.max(0, width - MIN_WIDTH) * share));
}

/** A node number as a BBS shows it: "07". */
export const nodeLabel = (n: number) => String(n).padStart(2, "0");

/** The door's frame: a double border, the title, and the node number. Fills the terminal. */
export function Frame(props: { title?: string; node: number; children: ReactNode; footer?: ReactNode }) {
  const { width, height } = useSize();
  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="double" borderColor="#c2410c" paddingX={1}>
      <Box justifyContent="space-between">
        <Text color="#fb923c" bold>
          {props.title ?? "W A T C H F I R E"}
        </Text>
        <Text color="#78716c">node {nodeLabel(props.node)}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {props.children}
      </Box>
      {props.footer ? <Box marginTop={1}>{props.footer}</Box> : null}
    </Box>
  );
}

/** A row of key hints: [F]eed  [W]arm … */
export function Keys(props: { keys: [string, string, boolean?][] }) {
  return (
    <Text wrap="wrap">
      {props.keys.map(([k, label, off], i) => (
        <Text key={k + label} dimColor={!!off}>
          {i > 0 ? "  " : ""}
          <Text color={off ? undefined : "#fbbf24"} bold>
            [{k}]
          </Text>
          {label}
        </Text>
      ))}
    </Text>
  );
}

/** A burn bar: a full bar is a day or more of fire. Red when under three hours. */
export function BurnBar(props: { secondsLeft: number; ash?: boolean; width?: number }) {
  const w = props.width ?? 10;
  if (props.ash) return <Text color="#57534e">{"·".repeat(w)}</Text>;
  const filled = Math.max(1, Math.round(w * Math.min(1, props.secondsLeft / DAY_SEC)));
  const color = props.secondsLeft < URGENT_SEC ? "#ef4444" : props.secondsLeft < LOW_SEC ? "#f97316" : "#fbbf24";
  return (
    <Text>
      <Text color={color}>{"▓".repeat(filled)}</Text>
      <Text color="#44403c">{"░".repeat(w - filled)}</Text>
    </Text>
  );
}

/**
 * Time left, red when urgent, "dark" for ash. `stale` (its server isn't answering) marks it as an
 * estimate: "~3h12m", dimmed. `pad` makes it a fixed-width table cell.
 */
export function TimeLeft(props: { secondsLeft: number; ash?: boolean; stale?: boolean; pad?: number }) {
  const text = (props.stale ? "~" : "") + (props.ash ? "dark" : formatDuration(props.secondsLeft));
  const color = props.ash || props.stale ? "#78716c" : props.secondsLeft < URGENT_SEC ? "#ef4444" : undefined;
  return <Text color={color}>{props.pad ? cell(text, props.pad) : text}</Text>;
}

/** The animated flame. Strength 0..1; 0 lets it die down to nothing. */
export function FlameView(props: { rows: number; strength: number; depth: 8 | 24; width?: number }) {
  const frameWidth = useSize().width;
  const width = (props.width ?? frameWidth) - 4;
  const flame = useRef<Flame | null>(null);
  if (!flame.current || flame.current.width !== width || flame.current.rows !== props.rows) {
    flame.current = new Flame(width, props.rows);
    for (let i = 0; i < props.rows * 2 + 4; i++) flame.current.step(props.strength); // start lit
  }
  const { frame } = useAnimation({ interval: 90 });
  // One step per animation tick, computed during render: one commit per frame.
  const lines = useMemo(() => {
    flame.current!.step(props.strength);
    return flame.current!.render(props.depth);
  }, [frame, width, props.rows, props.strength, props.depth]);
  // Ink lays out a constant blank row (its text-size cache hits) and swaps the colored frame in
  // only at output time, so new ~4 KB frame strings never pile up in that cache.
  const blank = " ".repeat(width);
  return (
    <Box flexDirection="column">
      {lines.map((l, i) => (
        <Transform key={i} transform={() => l}>
          <Text>{blank}</Text>
        </Transform>
      ))}
    </Box>
  );
}

/** A one-line text input: type, Backspace, Ctrl+U to clear, Enter to submit, Esc to cancel. */
export function TextInput(props: {
  label: string;
  initial?: string;
  max?: number;
  onSubmit(value: string): void;
  onCancel(): void;
  onChange?(value: string): void;
}) {
  const [value, setValue] = useState(props.initial ?? "");
  // Keystrokes can arrive faster than renders (SSH, fast typists), so read and write a ref rather
  // than the `value` this render captured.
  const valueRef = useRef(value);
  const set = (next: string) => {
    valueRef.current = next;
    setValue(next);
    props.onChange?.(next);
  };
  useInput((input, key) => {
    if (key.escape) return props.onCancel();
    if (key.return) return props.onSubmit(valueRef.current);
    if (key.backspace || key.delete) return set(valueRef.current.slice(0, -1));
    // Ctrl+U clears the line, as in a shell: handy for replacing a suggested name.
    if (key.ctrl && input === "u") return set("");
    if (key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return;
    // Typing fast (or over SSH), or pasting a line, can bring the text and the Enter in one chunk.
    const nl = input.search(/[\r\n]/);
    // Printable characters only: a paste may bring control bytes.
    const clean = stripControls(nl >= 0 ? input.slice(0, nl) : input);
    if (clean) set((valueRef.current + clean).slice(0, props.max ?? 64));
    if (nl >= 0) props.onSubmit(valueRef.current);
  });
  return (
    <Text>
      <Text color="#fbbf24">{props.label} </Text>
      {value}
      <Text inverse> </Text>
    </Text>
  );
}

/** A list cursor after ↑ ↓ PgUp PgDn, kept inside `length` items. */
export function stepCursor(key: Key, sel: number, length: number, page = 1): number {
  const last = Math.max(0, length - 1);
  if (key.upArrow) return Math.max(0, sel - 1);
  if (key.downArrow) return Math.min(last, sel + 1);
  if (key.pageUp) return Math.max(0, sel - page);
  if (key.pageDown) return Math.min(last, sel + page);
  return sel;
}

/** The selection marker in front of a list row. */
export const pointer = (on: boolean) => (on ? "▸ " : "  ");

/** Pad or cut to exactly `n` columns, for table cells. */
export function cell(s: string, n: number): string {
  const chars = [...s];
  return chars.length > n ? chars.slice(0, n - 1).join("") + "…" : s + " ".repeat(n - chars.length);
}

/** The status / message line. */
export function Message(props: { text: string; busy?: boolean }) {
  if (!props.text) return <Text> </Text>;
  return (
    <Text color={props.busy ? "#a8a29e" : "#fde68a"} wrap="truncate-end">
      {props.text}
    </Text>
  );
}
