import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { serverHost } from "@beaconsgg/client-sdk";
import {
  accessLabel,
  coverageLabel,
  directoryServers,
  hostOf,
  joinBlocker,
  serverLabel,
  safeText,
  type DirectoryServer,
  type ServerStatus,
} from "@watchfire/core";
import type { Game } from "../game.ts";
import type { Session } from "../session.ts";
import { cell, Frame, grow, Keys, Message, pointer, stepCursor, TextInput, useSize } from "../ui.tsx";

type Mode =
  | { kind: "list" }
  | { kind: "add" }
  | { kind: "join"; server: ServerStatus }
  | { kind: "browse"; list: DirectoryServer[] | null; error?: string };

const STATE: Record<ServerStatus["state"], [string, string, string]> = {
  ok: ["●", "#fbbf24", ""],
  notHosting: ["–", "#78716c", "doesn't host Watchfire (used for names only)"],
  keyChanged: ["✕", "#ef4444", "signs with a new key. Nothing goes to it. Delete and re-add it if you trust the change"],
  unreachable: ["○", "#78716c", "not answering"],
};

/** The player's servers: read fires from all of them, play on the ones marked play. */
export function Servers(props: { game: Game; session: Session; back(): void }) {
  const { game, session } = props;
  const { width, height } = useSize();
  const [sel, setSel] = useState(0);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [confirm, setConfirm] = useState<string | null>(null);
  const [dirSel, setDirSel] = useState(0);
  const list = game.servers;
  const cur = list[Math.min(sel, list.length - 1)];
  const fixed = game.serversFixed;

  const firesOn = (host?: string) => game.fires.filter((f) => hostOf(f.id) === host && f.phase === "burning").length;

  const browse = () => {
    setDirSel(0);
    setMode({ kind: "browse", list: null });
    directoryServers()
      .then((l) => setMode({ kind: "browse", list: l }))
      .catch((e) => setMode({ kind: "browse", list: [], error: safeText(e?.message ?? e, 80) }));
  };

  useInput(
    (input, key) => {
      const k = input.toLowerCase();
      if (mode.kind === "browse") {
        if (key.escape) return setMode({ kind: "list" });
        const l = mode.list ?? [];
        setDirSel((s) => stepCursor(key, s, l.length));
        if (key.return && l[dirSel] && !game.busy) {
          void game.addServer(l[dirSel]!.origin, "play").then((ok) => ok && setMode({ kind: "list" }));
        }
        return;
      }
      if (key.escape || k === "q") return props.back();
      setSel((s) => stepCursor(key, s, list.length));
      if (fixed || game.busy) return;
      if (k === "a") return setMode({ kind: "add" });
      if (k === "b") return browse();
      if (!cur) return;
      if (k === "j") {
        const why = joinBlocker(cur, { guest: game.isGuest, guestHint: game.guestHint });
        return why ? game.setMessage(why) : setMode({ kind: "join", server: cur });
      }
      if (input === "+" || input === "-") {
        const i = list.indexOf(cur);
        const dir = input === "+" ? -1 : 1;
        if (i + dir < 0 || i + dir >= list.length) return;
        setSel(i + dir);
        return void game.moveServer(cur.origin, dir);
      }
      if (k === "m" || input === " ") {
        setConfirm(null);
        return void game.setServerMode(cur.origin, cur.mode === "play" ? "watch" : "play");
      }
      if (k === "d") {
        if (confirm === cur.origin) {
          setConfirm(null);
          setSel((s) => Math.max(0, s - 1));
          return void game.removeServer(cur.origin);
        }
        setConfirm(cur.origin);
        return game.setMessage(`Press D again to remove ${cur.name ?? cur.origin}.`);
      }
    },
    { isActive: mode.kind !== "add" && mode.kind !== "join" },
  );

  const nameW = grow(18, width, 0.25, 40);
  const hostW = grow(16, width, 0.25, 40);
  const added = new Set(list.map((s) => s.origin));

  if (mode.kind === "browse") {
    const l = mode.list;
    return (
      <Frame node={session.node} title="SERVERS · THE BEACONS.GG DIRECTORY" footer={<Keys keys={[["↑↓", " choose"], ["Enter", " add"], ["Esc", " back"]]} />}>
        <Text color="#a8a29e">Servers listed as hosting Watchfire. Adding one checks the server's own signature first.</Text>
        <Box marginTop={1} flexDirection="column" flexGrow={1}>
          {l === null ? <Text color="#a8a29e">Asking the directory…</Text> : null}
          {mode.error ? <Text color="#ef4444">The directory didn't answer: {mode.error}</Text> : null}
          {l && l.length === 0 && !mode.error ? <Text color="#78716c">The directory lists no Watchfire servers.</Text> : null}
          {(l ?? []).slice(0, Math.max(3, height - 12)).map((s, i) => (
            <Text key={s.origin} color={i === dirSel ? "#fbbf24" : added.has(s.origin) ? "#78716c" : undefined} wrap="truncate-end">
              {pointer(i === dirSel)}
              {cell(safeText(s.name), nameW)} {cell(s.host, hostW)} {cell(coverageLabel(s.coverage), 10)} {cell(s.accessLevel, 8)}
              {added.has(s.origin) ? "added" : s.online ? "" : "offline"}
            </Text>
          ))}
        </Box>
        <Message text={game.message} busy={game.busy} />
      </Frame>
    );
  }

  return (
    <Frame
      node={session.node}
      title="SERVERS"
      footer={
        mode.kind === "add" || mode.kind === "join" ? (
          <Text color="#78716c">Enter to {mode.kind === "add" ? "add" : "send"} · Esc to cancel</Text>
        ) : (
          <Keys
            keys={[
              ["↑↓", " choose"],
              ["M", "ode play/watch", fixed || !cur],
              ["D", "elete", fixed || !cur],
              ["J", "oin", fixed || !cur || joinBlocker(cur, { guest: game.isGuest, guestHint: game.guestHint }) !== null],
              ["+/-", " priority", fixed || list.length < 2],
              ["A", "dd", fixed],
              ["B", "rowse", fixed],
              ["Esc", " back"],
            ]}
          />
        )
      }
    >
      <Text color="#a8a29e" wrap="wrap">
        Fires come from every server here. You light and feed fires only on servers you <Text color="#fbbf24">play</Text>; the
        ones you <Text color="#fde68a">watch</Text> you only see. When two servers cover a place equally, the higher one gets
        your new fires.
      </Text>
      {fixed ? <Text color="#fde68a">This session's servers were set with --server, so changes are off.</Text> : null}
      <Box marginTop={1} flexDirection="column" flexGrow={1}>
        {list.length === 0 ? <Text color="#78716c">No servers. Press A to add one by address, or B to browse the directory.</Text> : null}
        {list.map((s, i) => {
          const [icon, color, note] = STATE[s.state === "ok" && game.isQuiet(s) ? "unreachable" : s.state];
          return (
            <Text key={s.origin} wrap="truncate-end" color={i === sel ? "#fbbf24" : undefined}>
              {pointer(i === sel)}
              <Text color={color}>{icon}</Text> {cell(serverLabel(s), nameW)} {cell(serverHost(s.host, s.origin), hostW)}{" "}
              <Text color={s.mode === "play" ? "#fbbf24" : "#fde68a"}>{cell(s.mode, 6)}</Text>
              {note ? (
                <Text color={color}>{note}</Text>
              ) : (
                <>
                  <Text color={s.access === "member" || !s.access ? "#a8a29e" : "#fde68a"}>{cell(accessLabel(s), 14)}</Text>
                  <Text color="#a8a29e">
                    {cell(coverageLabel(s.coverage), 10)} {firesOn(s.host)} burning
                  </Text>
                </>
              )}
            </Text>
          );
        })}
      </Box>
      {mode.kind === "add" ? (
        <TextInput
          label="Server address:"
          max={120}
          onCancel={() => setMode({ kind: "list" })}
          onSubmit={async (addr) => {
            if (!addr.trim()) return setMode({ kind: "list" });
            if (await game.addServer(addr, "play")) setMode({ kind: "list" });
          }}
        />
      ) : mode.kind === "join" ? (
        <Box flexDirection="column">
          <Text color="#a8a29e">
            Asking to join {serverLabel(mode.server)}. Its operator sees your profile and this note.
          </Text>
          <TextInput
            label="Note (optional):"
            max={280}
            onCancel={() => setMode({ kind: "list" })}
            onSubmit={async (note) => {
              setMode({ kind: "list" });
              await game.requestJoin(mode.server.origin, note.trim() || undefined);
            }}
          />
        </Box>
      ) : cur && cur.state !== "unreachable" ? (
        <Text color="#78716c" wrap="truncate-end">
          {cur.name}
          {cur.description ? `: ${cur.description}` : ""} · {cur.accessLevel ?? "open"} · v{cur.version}
          {cur.ms != null ? ` · ${cur.ms} ms` : ""}
        </Text>
      ) : null}
      <Message text={game.message} busy={game.busy} />
    </Frame>
  );
}
