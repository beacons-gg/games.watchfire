// Bundle the door into one file (the SDK, the game, ssh2 and the city list included), so its
// container image needs nothing but Node: no install.
import { fileURLToPath } from "node:url";
import { bundle } from "../../scripts/bundle.ts";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
await bundle(here("./src/door.ts"), here("./dist/door.mjs"), {
  // ssh2 asks for its optional native helpers inside try/catch and runs without them.
  external: ["cpu-features"],
});
