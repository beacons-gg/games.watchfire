import { useState } from "react";
import type { ReportFire, WorldReport } from "@watchfire/core/report";
import { FlameCanvas } from "./FlameCanvas.tsx";
import { DOWNLOAD_URL } from "@watchfire/core/tuning";
import { DownloadButton, HowToPlay, JoinCommand, Play } from "./Guide.tsx";
import { WorldMap } from "./WorldMap.tsx";
import { ago, burnFraction, clock, DAY_SEC, duration, isLit, RULES, urgency } from "./format.ts";
import { useWorld } from "./useWorld.ts";

export function App() {
  const { report, error, now } = useWorld();
  // Until the door answers, the likeliest command; null once it says this site has no door to offer.
  const join = report ? report.join : `ssh -p 2222 ${location.hostname}`;
  // Where to download the game: the door says (it may point elsewhere, or nowhere).
  const download = report ? report.download : DOWNLOAD_URL;
  const playable = !!(download || join);
  const [selected, setSelected] = useState<string | null>(null);

  const fires = report?.fires ?? [];
  const burning = fires.filter((f) => isLit(f, now)).sort((a, b) => a.outAt - b.outAt);
  const dark = fires.filter((f) => !isLit(f, now));
  const darkToday = dark.filter((f) => now - f.outAt < DAY_SEC).length;
  const litToday = fires.filter((f) => now - f.placedAt < DAY_SEC).length;
  const chosen = fires.find((f) => f.id === selected) ?? null;
  // The hero burns higher the more fires are burning: a low glow when none are.
  const strength = burning.length === 0 ? 0.35 : 0.7 + 0.3 * Math.min(1, burning.length / 6);

  return (
    <>
      <header className="top">
        <a className="brand" href="#top">
          WATCHFIRE
        </a>
        <nav aria-label="Sections">
          <a href="#tonight">Tonight</a>
          <a href="#how">How to play</a>
          {playable ? <a href="#play">Play</a> : null}
        </nav>
        <LiveBadge report={report} error={error} />
      </header>

      <main id="top">
        <section className="hero">
          <FlameCanvas strength={strength} className="hero-flame" />
          <div className="hero-text">
            <p className="kicker">A door game for your terminal</p>
            <h1>Somewhere in the world, a fire is about to go out.</h1>
            <p className="lede">
              You have <strong>{RULES.logsPerDay} logs</strong> today. Lay them on the fires you care about, light new ones at
              real places, and come back tomorrow to see what survived the night. A visit takes about a minute.
            </p>
            {download ? <DownloadButton href={download} /> : null}
            {join ? (
              <>
                {download ? <p className="hint">Or play at this door over ssh, with nothing to download:</p> : null}
                <JoinCommand command={join} />
              </>
            ) : null}
            <p className="hint">
              It runs in your terminal, like the door games of the old bulletin boards.
              {playable ? (
                <>
                  {" "}
                  <a href="#play">First time? Here's how.</a>
                </>
              ) : null}
            </p>
          </div>
          <dl className="stats">
            <Stat label="burning now" value={report ? String(burning.length) : "…"} />
            <Stat
              label={burning[0] ? `left on ${burning[0].name}` : "closest to going out"}
              value={burning[0] ? duration(burning[0].outAt - now) : "-"}
              tone={burning[0] ? urgency(burning[0].outAt - now) : undefined}
            />
            <Stat label="went dark today" value={report ? String(darkToday) : "…"} />
            {report && report.online === null ? (
              // No door here to count: what was lit instead, beside what went dark.
              <Stat label="lit today" value={String(litToday)} />
            ) : (
              <Stat label={report?.online === 1 ? "keeper at the door" : "at the door now"} value={report ? String(report.online) : "…"} />
            )}
          </dl>
        </section>

        <section id="tonight" className="band">
          <div className="section-head">
            <h2>The fires tonight</h2>
            <p>Every fire sits at a real place. The map updates on its own; pick a fire to see who's keeping it.</p>
          </div>
          {error ? <p className="notice">{error}{report ? " Showing the last look." : ""}</p> : null}
          <div className="tonight">
            <WorldMap fires={fires} now={now} selected={selected} onSelect={setSelected} />
            <aside className="side">
              {chosen ? <FireCard fire={chosen} now={now} onClose={() => setSelected(null)} /> : null}
              <h3>Closest to going out</h3>
              {burning.length === 0 ? (
                <p className="muted">{report ? "No fires burning. Be the one to strike a light." : "Looking at the world…"}</p>
              ) : (
                <ol className="fire-list">
                  {burning.slice(0, 8).map((f) => (
                    <li key={f.id}>
                      <button type="button" className={f.id === selected ? "on" : ""} onClick={() => setSelected(f.id)}>
                        <span className="fire-name">{f.name}</span>
                        <span className="fire-near">{f.near ?? f.server}</span>
                        <BurnBar fire={f} now={now} />
                        <span className={`time ${urgency(f.outAt - now)}`}>{duration(f.outAt - now)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {dark.length > 0 ? (
                <p className="muted small">
                  {dark.length} {dark.length === 1 ? "fire has" : "fires have"} gone dark lately; their keepers can still rake the ashes.
                </p>
              ) : null}
            </aside>
          </div>
        </section>

        <section id="log" className="band">
          <div className="section-head">
            <h2>The watch log</h2>
            <p>What happened out there, as the door saw it.</p>
          </div>
          {report && report.news.length > 0 ? (
            <ul className="news">
              {[...report.news]
                .reverse()
                .slice(0, 14)
                .map((n, i) => (
                  <li key={`${n.at}-${i}`}>
                    <time dateTime={new Date(n.at * 1000).toISOString()}>{ago(n.at, now)}</time>
                    <span>{n.text}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="muted">{report ? "Quiet so far. The log fills as fires are lit, fed and lost." : "Reading the log…"}</p>
          )}
        </section>

        <HowToPlay />
        {playable ? <Play download={download} command={join} /> : null}
      </main>

      <footer className="foot">
        <p>
          Watchfire runs on <a href="https://beacons.gg">Beacon</a>: every fire lives on a Beacon server, and its rules live in the
          fire itself, so nobody (not even this site) can bend them.
        </p>
        <p className="muted small">
          Map data: Natural Earth. City names: GeoNames (geonames.org), CC BY 4.0. This page only reads; it keeps nothing about you.
        </p>
      </footer>
    </>
  );
}

function LiveBadge(props: { report: WorldReport | null; error: string | null }) {
  const { report, error } = props;
  if (error) return <span className="badge off">door not answering</span>;
  if (!report) return <span className="badge">connecting…</span>;
  return (
    <span className="badge live" title={report.partial ? "A server isn't answering; some fires are as last seen." : undefined}>
      <span className="dot" aria-hidden="true" />
      live{report.partial ? " (partly)" : ""}
    </span>
  );
}

function Stat(props: { label: string; value: string; tone?: string | undefined }) {
  return (
    <div className="stat">
      <dt>{props.label}</dt>
      <dd className={props.tone}>{props.value}</dd>
    </div>
  );
}

/** The time bar, on the game's log scale: full at the longest a fire can burn. */
function BurnBar(props: { fire: ReportFire; now: number }) {
  const left = props.fire.outAt - props.now;
  const filled = Math.max(0.04, burnFraction(left));
  return (
    <span className="burn" aria-hidden="true">
      <span className={`burn-fill ${urgency(left)}`} style={{ width: `${filled * 100}%` }} />
    </span>
  );
}

function FireCard(props: { fire: ReportFire; now: number; onClose(): void }) {
  const f = props.fire;
  const left = f.outAt - props.now;
  const lit = isLit(f, props.now);
  return (
    <article className="fire-card" aria-live="polite">
      <button type="button" className="close" onClick={props.onClose} aria-label="Close">
        ×
      </button>
      <h3>{f.name}</h3>
      <p className="muted">{f.near ? `near ${f.near}` : `${f.lat.toFixed(2)}, ${f.lng.toFixed(2)}`}</p>
      <p className={`big ${lit ? urgency(left) : "ash"}`}>
        {lit ? `out in ${duration(left)}` : `went dark ${ago(f.outAt, props.now)}`}
        {lit ? <span className="muted"> · at {clock(f.outAt, props.now * 1000)}</span> : null}
      </p>
      <dl className="facts">
        <dt>Logs</dt>
        <dd>
          {f.logs} of {f.capacity ?? RULES.capacity}
          {f.logs >= RULES.emberAt ? " · embers ready" : ` · embers at ${RULES.emberAt}`}
        </dd>
        <dt>Keepers</dt>
        <dd>{f.keepers}</dd>
        <dt>Warmed hands</dt>
        <dd>{f.warmth}</dd>
        <dt>Embers taken</dt>
        <dd>{f.embers}</dd>
        <dt>Lit</dt>
        <dd>
          {ago(f.placedAt, props.now)}
          {f.lighter ? ` by ${f.lighter}` : ""}
        </dd>
        <dt>Server</dt>
        <dd>{f.server}</dd>
      </dl>
      {f.stale ? <p className="muted small">Its server isn't answering: this is the fire as last seen.</p> : null}
    </article>
  );
}
