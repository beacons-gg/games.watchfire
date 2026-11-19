// Bundle the CLI into one file, SDK and city list included, so `npx watchfire` needs no access
// to the private @beaconsgg registry.
import { build } from "esbuild";

await build({
  entryPoints: [new URL("./src/main.tsx", import.meta.url).pathname],
  outfile: new URL("./dist/watchfire.mjs", import.meta.url).pathname,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  jsx: "automatic",
  minify: true,
  legalComments: "external",
  // Ink loads devtools only when DEV=true; a stub keeps the optional package out of the bundle.
  alias: { "react-devtools-core": new URL("./build-stub-devtools.js", import.meta.url).pathname },
  define: { "process.env.NODE_ENV": '"production"' },
  banner: {
    // The entry's own #!/usr/bin/env node stays on line 1.
    // CommonJS dependencies inside an ES module bundle still call require().
    js: "import { createRequire as __wfRequire } from 'node:module'; const require = __wfRequire(import.meta.url);",
  },
  logLevel: "info",
});
