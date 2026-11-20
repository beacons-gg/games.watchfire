// One way to bundle a Watchfire app into a single .mjs file that runs on Node with nothing
// installed: the CLI (and its executables) and the SSH door's container image both use it.
import { fileURLToPath } from "node:url";
import { build, type BuildOptions, type Metafile } from "esbuild";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Bundle `entry` into `outfile`. Resolves to what went in (esbuild's metafile). */
export async function bundle(entry: string, outfile: string, extra: BuildOptions = {}): Promise<Metafile> {
  const result = await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    jsx: "automatic",
    minify: true,
    legalComments: "external",
    // Ink loads devtools only when DEV=true; a stub keeps the optional package out of the bundle.
    alias: { "react-devtools-core": here("./build-stub-devtools.js") },
    define: { "process.env.NODE_ENV": '"production"' },
    banner: {
      // CommonJS dependencies inside an ES module bundle still call require() and read __dirname.
      // (An entry's own #!/usr/bin/env node stays on line 1.)
      js: [
        "import { createRequire as __wfRequire } from 'node:module';",
        "import { fileURLToPath as __wfPath } from 'node:url';",
        "const require = __wfRequire(import.meta.url);",
        "const __filename = __wfPath(import.meta.url);",
        "const __dirname = __wfPath(new URL('.', import.meta.url));",
      ].join(" "),
    },
    logLevel: "info",
    metafile: true,
    ...extra,
  });
  return result.metafile!;
}
