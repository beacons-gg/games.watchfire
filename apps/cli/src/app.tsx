import { useEffect, useRef, useState } from "react";
import { useApp } from "ink";
import { useGame } from "./game.ts";
import type { Session } from "./session.ts";
import { Fire } from "./screens/Fire.tsx";
import { Help } from "./screens/Help.tsx";
import { Light } from "./screens/Light.tsx";
import { Main } from "./screens/Main.tsx";
import { News } from "./screens/News.tsx";
import { Servers } from "./screens/Servers.tsx";
import { You } from "./screens/You.tsx";
import { Watch } from "./screens/Watch.tsx";
import { World } from "./screens/World.tsx";

type Screen =
  | { name: "main" }
  | { name: "fire"; id: string; from: "main" | "world" }
  | { name: "world" | "light" | "news" | "you" | "servers" | "help" }
  | { name: "watch"; firstRun: boolean };

export function App(props: { session: Session; onQuit?: () => void }) {
  const { session } = props;
  const game = useGame(session);
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>({ name: "main" });
  const checkedFirstRun = useRef(false);

  // First run: ask where the keeper keeps watch, once the saved state has loaded.
  useEffect(() => {
    if (checkedFirstRun.current || game.status === "connecting") return;
    checkedFirstRun.current = true;
    if (!game.keeper.watch) setScreen({ name: "watch", firstRun: true });
  }, [game.status, game.keeper.watch]);

  const home = () => {
    game.setMessage("");
    setScreen({ name: "main" });
  };
  const quit = () => {
    props.onQuit?.();
    exit();
  };

  switch (screen.name) {
    case "fire":
      return (
        <Fire
          game={game}
          session={session}
          fireId={screen.id}
          back={() => {
            game.setMessage("");
            setScreen(screen.from === "world" ? { name: "world" } : { name: "main" });
          }}
        />
      );
    case "world":
      return <World game={game} session={session} open={(id) => setScreen({ name: "fire", id, from: "world" })} back={home} />;
    case "light":
      return <Light game={game} session={session} lit={(id) => setScreen({ name: "fire", id, from: "main" })} back={home} />;
    case "news":
      return <News game={game} session={session} back={home} />;
    case "you":
      return <You game={game} session={session} back={home} />;
    case "servers":
      return <Servers game={game} session={session} back={home} />;
    case "help":
      return <Help session={session} back={home} />;
    case "watch":
      return (
        <Watch
          game={game}
          session={session}
          firstRun={screen.firstRun}
          done={(place) => {
            if (screen.firstRun && place && session.keyHint && !game.keeper.toldKeyHint) {
              game.setMessage(`Your keeper's key is in ${session.keyHint}. Back it up: watchfire phrase`);
              void game.markKeyHintSeen();
            }
            home();
          }}
        />
      );
    default:
      return (
        <Main
          game={game}
          session={session}
          go={(name) => {
            game.setMessage("");
            setScreen(name === "watch" ? { name, firstRun: false } : { name });
          }}
          open={(id) => setScreen({ name: "fire", id, from: "main" })}
          quit={quit}
        />
      );
  }
}
