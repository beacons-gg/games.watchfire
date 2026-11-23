import { memo, useState, type ReactNode } from "react";
import { RULES } from "./format.ts";

// The flyer's words: how to play and how to start. Nothing here changes with the world, so these
// stay out of the page's once-a-second countdown renders.

/** A command to type, with a Copy button. */
export function JoinCommand(props: { command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // No clipboard (an http page on some browsers): the command is there to select.
    }
  };
  return (
    <div className="join-command">
      <code>
        <span className="prompt" aria-hidden="true">
          ${" "}
        </span>
        {props.command}
      </code>
      <button type="button" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** The rules, the steps, a look at the game and its keys. Static: it never re-renders. */
export const HowToPlay = memo(function HowToPlay() {
  const r = RULES;
  return (
    <section id="how" className="band">
      <div className="section-head">
        <h2>How to play</h2>
        <p>One minute a day. Three logs. Fires that live only because someone chose them.</p>
      </div>

      <ol className="steps">
        <li>
          <h3>Look around</h3>
          <p>
            Tell the game where you keep watch (any town or city). It shows the fires nearest you, and the ones anywhere closest to
            going out.
          </p>
        </li>
        <li>
          <h3>Spend your logs</h3>
          <p>
            You get <strong>{r.logsPerDay} logs a day</strong>. Lay one on a fire to keep it burning longer, or spend one to light a
            new fire anywhere in the world, and give it a name.
          </p>
        </li>
        <li>
          <h3>Come back tomorrow</h3>
          <p>
            Fires burn down while you're away. The watch log tells you what was lit, what was fed, and what went dark in the night.
          </p>
        </li>
      </ol>

      <div className="rules">
        <Rule title="How long a fire burns">
          A new fire burns <strong>{r.baseHours} hours</strong> on its own, and every log adds <strong>{r.hoursPerLog} more</strong>.
          A fire holds {r.capacity} logs at most, so every fire goes dark within {r.maxHours} hours, and someone has to light the next.
        </Rule>
        <Rule title="Keepers">
          Lay a log on a fire and you're one of its keepers. One keeper can carry a fire into tomorrow; it takes two to keep pace
          with the clock.
        </Rule>
        <Rule title="Embers">
          Once a fire holds {r.emberAt} logs, each of its keepers may take <strong>one ember</strong>: proof you helped keep it. Your
          embers are your record.
        </Rule>
        <Rule title="Ashes">
          When a fire goes dark, its keepers can rake their logs back out of the ashes for two days: a record of the fires you saw to
          the end.
        </Rule>
        <Rule title="Warm your hands">
          Anyone, keeper or not, can warm their hands at a fire once. It costs nothing, and the fire shows how many have stopped by.
        </Rule>
        <Rule title="Fair for everyone">
          The rules live inside each fire on its Beacon server, which enforces them: no one can overfill a fire, take two embers, or
          feed a fire that's already dark.
        </Rule>
      </div>

      <div className="screens">
        <figure className="terminal" aria-label="What the game looks like">
          <pre>{`╔═══════════════════════════════════════════════╗
║ W A T C H F I R E                     node 03 ║
║ ▀▀▄▀▀▀▀▄▀▀▀▀▀▀▄▀▀▀▀▀▀▀▀▀▄▀▀▀▀▀▀▀▀▄▀▀▀▀▀▀▀▀▄▀▀ ║
║ 4 fires burning · 1 went dark overnight       ║
║ Sleepy Fox · watching from Lisbon · ●●○       ║
║                                               ║
║ Nearest fires                                 ║
║ 1 The Lantern       ▓▓▓▓▓▓▓░░░ 20h28m  3/12   ║
║ 2 Harbour Light     ▓▓░░░░░░░░  2h41m  1/12   ║
║                                               ║
║ » Quiet Wren lit Harbour Light.               ║
║                                               ║
║ [1] visit [W]orld [L]ight [N]ews [?]help      ║
╚═══════════════════════════════════════════════╝`}</pre>
          <figcaption>The main screen. Single keys do everything: number keys open a fire, F feeds it, Q leaves.</figcaption>
        </figure>
        <div className="keys">
          <h3>At a fire</h3>
          <dl>
            <dt>F</dt>
            <dd>Feed it a log</dd>
            <dt>W</dt>
            <dd>Warm your hands</dd>
            <dt>E</dt>
            <dd>Take your ember (at {r.emberAt} logs)</dd>
            <dt>R</dt>
            <dd>Rake the ashes (once it's dark)</dd>
          </dl>
          <h3>Anywhere</h3>
          <dl>
            <dt>L</dt>
            <dd>Light a new fire</dd>
            <dt>W</dt>
            <dd>The whole world, closest to going out first</dd>
            <dt>N</dt>
            <dd>The watch log</dd>
            <dt>Y</dt>
            <dd>You: your embers, and your keeper's backup</dd>
            <dt>?</dt>
            <dd>The rules, in the game</dd>
            <dt>Q</dt>
            <dd>Leave (the fires burn on without you)</dd>
          </dl>
        </div>
      </div>
    </section>
  );
});

function Rule(props: { title: string; children: ReactNode }) {
  return (
    <div className="rule">
      <h3>{props.title}</h3>
      <p>{props.children}</p>
    </div>
  );
}

const SYSTEMS = ["windows", "mac", "linux", "ssh", "phone"] as const;
type System = (typeof SYSTEMS)[number];
const NAMES: Record<System, string> = { windows: "Windows", mac: "Mac", linux: "Linux", ssh: "Over ssh", phone: "Phone or tablet" };

/** The visitor's computer, from the browser's own description of it. */
function guessSystem(): System {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|Android/i.test(ua)) return "phone";
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac/i.test(ua)) return "mac";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "windows";
}

/** The hero's download button: named for the visitor's computer. */
export function DownloadButton(props: { href: string }) {
  const system = guessSystem();
  const name = system === "mac" ? "Mac" : system === "linux" ? "Linux" : "Windows";
  return (
    <p className="download">
      <a className="download-button" href={props.href}>
        Download for {system === "phone" || system === "ssh" ? "your computer" : name}
      </a>
      <span className="muted small">Windows, Mac and Linux · free · nothing to install</span>
    </p>
  );
}

/**
 * How to start playing: download the game for your computer (most players), or, when this site has
 * a door, come in over ssh, which is also the way in from a phone. Re-renders only when its inputs do.
 */
export const Play = memo(function Play(props: { download: string | null; command: string | null }) {
  const { download, command } = props;
  const offered = SYSTEMS.filter((s) => (s === "ssh" || s === "phone" ? !!command : !!download));
  const guess = guessSystem();
  const [chosen, setChosen] = useState<System>(offered.includes(guess) ? guess : offered[0]!);
  const system = offered.includes(chosen) ? chosen : offered[0]!;
  const atDoor = system === "ssh" || system === "phone";
  const get = (file: string) => (
    <>
      Download <code>{file}</code> from{" "}
      <a href={download ?? undefined} target="_blank" rel="noreferrer">
        the download page
      </a>
    </>
  );
  return (
    <section id="play" className="band">
      <div className="section-head">
        <h2>Start playing</h2>
        <p>
          {download
            ? "Watchfire runs in a terminal window on your own computer: download it, unpack it, run it. Nothing to install, and it takes two minutes the first time."
            : "Watchfire runs on a computer at home; you visit it over ssh, the same way programmers reach servers. It takes two minutes the first time."}
        </p>
      </div>
      {offered.length > 1 ? (
        <div className="tabs" role="tablist" aria-label="Your device">
          {offered.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={system === s} onClick={() => setChosen(s)}>
              {NAMES[s]}
            </button>
          ))}
        </div>
      ) : null}
      <div className="join-steps" role="tabpanel">
        {system === "windows" ? (
          <ol>
            <li>{get("watchfire-…-windows-x64.zip")}, and unzip it (right-click it, then Extract All).</li>
            <li>
              Open the unzipped folder, right-click inside it and choose <strong>Open in Terminal</strong>. (On Windows 10: hold Shift
              as you right-click, then Open PowerShell window here.)
            </li>
            <li>
              Run the game:
              <JoinCommand command=".\watchfire.exe" />
              Windows may say it protected your PC from an unknown app: choose <strong>More info</strong>, then <strong>Run anyway</strong>.
            </li>
            <li>Make the window big. The game fills whatever size you give it (80 by 24 at least).</li>
          </ol>
        ) : system === "mac" ? (
          <ol>
            <li>
              {get("watchfire-…-macos-arm64.tar.gz")} (a Mac with an Intel processor: <code>macos-x64</code>), and double-click it to
              unpack it.
            </li>
            <li>
              Open <strong>Terminal</strong> (Spotlight, type Terminal, press Enter), type <code>cd</code> and a space, drag the unpacked
              folder onto the window, and press Enter.
            </li>
            <li>
              The first time only: the game isn't notarized by Apple yet, so let your Mac run it:
              <JoinCommand command="xattr -d com.apple.quarantine watchfire" />
            </li>
            <li>
              Run the game:
              <JoinCommand command="./watchfire" />
            </li>
          </ol>
        ) : system === "linux" ? (
          <ol>
            <li>{get("watchfire-…-linux-x64.tar.gz")} (on ARM: <code>linux-arm64</code>).</li>
            <li>
              In a terminal, in the folder you downloaded it to, unpack it:
              <JoinCommand command="tar -xzf watchfire-*-linux-x64.tar.gz" />
            </li>
            <li>
              Run the game:
              <JoinCommand command="./watchfire-*-linux-x64/watchfire" />
            </li>
            <li>Make the window big. The game fills whatever size you give it (80 by 24 at least).</li>
          </ol>
        ) : system === "phone" ? (
          <ol>
            <li>
              Install an ssh app: <strong>Termius</strong> (iPhone, iPad and Android) is free and friendly.
            </li>
            <li>In the app, create a key (Termius: Keychain → Keys → Generate). That key will be your keeper.</li>
            <li>
              Add a host with the address and port from this command, using that key, and connect:
              <JoinCommand command={command ?? ""} />
            </li>
            <li>Turn the phone sideways: the game wants 80 columns.</li>
          </ol>
        ) : (
          <ol>
            <li>
              Nothing to download: you play on this site's computer, the door. Open a terminal: <strong>PowerShell</strong> on Windows,{" "}
              <strong>Terminal</strong> on a Mac or Linux.
            </li>
            <li>
              The first time only, make yourself a key. Press Enter at each question:
              <JoinCommand command="ssh-keygen -t ed25519" />
            </li>
            <li>
              Come in:
              <JoinCommand command={command ?? ""} />
              The first time, ssh asks whether to trust this computer: type <code>yes</code>.
            </li>
            <li>Make the window big. The game fills whatever size you give it (80 by 24 at least).</li>
          </ol>
        )}
      </div>
      <div className={atDoor ? "rules two" : "rules"}>
        {atDoor ? (
          <>
            <Rule title="Your key is your keeper">
              The door knows you by your ssh key. Come back from the same computer (or phone) and you're the same keeper, with your
              embers and your fires. A new device with a new key is a new keeper.
            </Rule>
            <Rule title="No key? Come in as a guest">
              Without a key you can still look around as a guest: see the fires, the map and the log. Guests can't lay logs; make a
              key when you want to play.
            </Rule>
            <Rule title="One seat each">
              A keeper sits at the door once at a time, so a second window with the same key is turned away. Everyone else is welcome
              at once: who's online (O) shows who's there, and you can page them.
            </Rule>
          </>
        ) : (
          <>
            <Rule title="Your keeper lives on your computer">
              The game makes your keeper the first time you play and keeps it in your home folder. Its 12 secret words (in the game:
              Y, then K) are its backup: write them down, and they bring your keeper back on a new computer.
            </Rule>
            <Rule title="New versions">
              The game tells you on its main screen when a new version is out. Download it the same way: your keeper, your embers and
              your fires carry on.
            </Rule>
          </>
        )}
        <Rule title="Leave any time">
          Q leaves, or just close the window. Your logs are already on the fires, and they burn on without you.
        </Rule>
      </div>
    </section>
  );
});
