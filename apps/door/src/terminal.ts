import { Transform } from "node:stream";
import type { ServerChannel } from "ssh2";

/** What the player's terminal told us in its pty request (and later window changes). */
export interface Pty {
  cols: number;
  rows: number;
  term: string;
}

export interface Terminal {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  /** Tell Ink the window changed size. */
  resize(cols: number, rows: number): void;
}

/**
 * Streams that look like a terminal to Ink, which reads `isTTY`, `columns`, `rows` and
 * `setRawMode`, and listens for `resize`, over an SSH session channel. There is no line discipline
 * on the door's side of SSH: the player's own terminal is already raw (ssh put it there), and
 * nothing turns "\n" into "\r\n" for us, so output is translated here. Every keystroke passes
 * `onInput` on its way in (for the idle timeout).
 */
export function asTerminal(channel: ServerChannel, pty: Pty, onInput: () => void): Terminal {
  const stdin = new Transform({
    transform(chunk, _enc, done) {
      onInput();
      done(null, chunk);
    },
  });
  const stdout = new Transform({
    transform(chunk, _enc, done) {
      done(null, String(chunk).replace(/\r?\n/g, "\r\n"));
    },
  });
  channel.pipe(stdin);
  stdout.pipe(channel, { end: false });

  const tty = (s: Transform) => Object.assign(s, { isTTY: true, setRawMode: () => s, ref: () => s, unref: () => s });
  const out = Object.assign(tty(stdout), { columns: pty.cols, rows: pty.rows });
  return {
    stdin: tty(stdin) as unknown as NodeJS.ReadStream,
    stdout: out as unknown as NodeJS.WriteStream,
    resize(cols, rows) {
      out.columns = cols;
      out.rows = rows;
      out.emit("resize");
    },
  };
}
