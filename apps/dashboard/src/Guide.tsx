import { memo, useState, type ReactNode } from "react";
import { RULES } from "./format.ts";

// The flyer's words: how to play and how to join. Nothing here changes with the world, so these
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
            <dt>O</dt>
            <dd>Who's online, and page them</dd>
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

const SYSTEMS = ["mac", "windows", "phone"] as const;
type System = (typeof SYSTEMS)[number];

/** How to come in, on a Mac or Linux, Windows, or a phone. Re-renders only when the command does. */
export const Join = memo(function Join(props: { command: string }) {
  const guess: System = /Windows/i.test(navigator.userAgent) ? "windows" : /iPhone|iPad|Android/i.test(navigator.userAgent) ? "phone" : "mac";
  const [system, setSystem] = useState<System>(guess);
  const names: Record<System, string> = { mac: "Mac or Linux", windows: "Windows", phone: "Phone or tablet" };
  return (
    <section id="join" className="band">
      <div className="section-head">
        <h2>Join</h2>
        <p>Watchfire runs on a computer at home; you visit it over ssh, the same way programmers reach servers. It takes two minutes the first time.</p>
      </div>
      <div className="tabs" role="tablist" aria-label="Your device">
        {SYSTEMS.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={system === s} onClick={() => setSystem(s)}>
            {names[s]}
          </button>
        ))}
      </div>
      <div className="join-steps" role="tabpanel">
        {system === "phone" ? (
          <ol>
            <li>
              Install an ssh app: <strong>Termius</strong> (iPhone, iPad and Android) is free and friendly.
            </li>
            <li>In the app, create a key (Termius: Keychain → Keys → Generate). That key will be your keeper.</li>
            <li>
              Add a host with the address and port from this command, using that key, and connect:
              <JoinCommand command={props.command} />
            </li>
            <li>Turn the phone sideways: the game wants 80 columns.</li>
          </ol>
        ) : (
          <ol>
            <li>
              Open {system === "windows" ? <strong>PowerShell</strong> : <strong>Terminal</strong>}
              {system === "windows" ? " (press the Windows key, type PowerShell, press Enter)." : " (on a Mac: Spotlight, type Terminal, press Enter)."}
            </li>
            <li>
              The first time only, make yourself a key. Press Enter at each question:
              <JoinCommand command="ssh-keygen -t ed25519" />
            </li>
            <li>
              Come in:
              <JoinCommand command={props.command} />
              The first time, ssh asks whether to trust this computer: type <code>yes</code>.
            </li>
            <li>Make the window big. The game fills whatever size you give it (80 by 24 at least).</li>
          </ol>
        )}
      </div>
      <div className="rules two">
        <Rule title="Your key is your keeper">
          The door knows you by your ssh key. Come back from the same computer (or phone) and you're the same keeper, with your
          embers and your fires. A new device with a new key is a new keeper.
        </Rule>
        <Rule title="No key? Come in as a guest">
          Without a key you can still look around as a guest: see the fires, the map and the log. Guests can't lay logs; make a key
          (step 2) when you want to play.
        </Rule>
        <Rule title="Leave any time">
          Q leaves, or just close the window. Your logs are already on the fires, and they burn on without you. Sessions end on
          their own after a few idle minutes.
        </Rule>
        <Rule title="One seat each">
          A keeper sits at the door once at a time, so a second window with the same key is turned away. Everyone else is welcome
          at once: who's online (O) shows who's there, and you can page them.
        </Rule>
      </div>
    </section>
  );
});
