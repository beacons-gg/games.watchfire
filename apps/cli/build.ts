// Bundle the CLI into one file, SDK and city list included, so `npx watchfire` needs no access
// to the private @beaconsgg registry.
import { fileURLToPath } from "node:url";
import { bundle } from "../../scripts/bundle.ts";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
await bundle(here("./src/main.tsx"), here("./dist/watchfire.mjs"));
