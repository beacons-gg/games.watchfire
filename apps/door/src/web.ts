import { createReadStream, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pipeline } from "node:stream";
import type { WorldLook, WorldReport } from "@watchfire/core";

/** What the dashboard's build contains. */
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};
const TEXT = "text/plain; charset=utf-8";

/** Headers on everything: the site is static and reads only its own API. */
const BASE_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
};

export interface WebOptions {
  port: number;
  bind: string;
  /** The built dashboard (`apps/dashboard/dist`). */
  root: string;
  report(): WorldLook | null;
  /** Callers on the door now, or null with no door here. */
  online(): number | null;
  /** The join command for a visitor who reached the site at `host` (from their Host header), or null for none. */
  join(host: string): string | null;
  log(event: string, fields?: object): void;
}

/**
 * The website: the dashboard's files, and `/api/world` (the door's latest look at the world).
 * Read-only: GET and HEAD, nothing else.
 */
export function startWeb(opts: WebOptions): Server {
  const root = resolve(opts.root);
  const assets = join(root, "assets") + sep;
  const server = createServer((req, res) => {
    try {
      handle(req, res);
    } catch (e) {
      opts.log("web-error", { error: String((e as Error)?.message ?? e) });
      if (!res.headersSent) send(res, 500, TEXT, "Something went wrong.");
    }
  });
  // A port in use (or any listen failure) costs the website, never the door's ssh sessions.
  server.on("error", (e) => opts.log("web-error", { error: e.message }));

  const handle = (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, TEXT, "Read only.", { allow: "GET, HEAD" });
    const url = new URL(req.url ?? "/", "http://door");
    if (url.pathname === "/api/world") {
      const report = opts.report();
      if (!report) return send(res, 503, "application/json", JSON.stringify({ error: "The door hasn't looked at the world yet." }), { "retry-after": "5" });
      const body: WorldReport = { ...report, join: opts.join(visitorHost(req)), online: opts.online() };
      return send(res, 200, "application/json", JSON.stringify(body), { "cache-control": "no-store" });
    }
    // A file from the build, or the page itself for anything else (one page, no routes). A build
    // file that's gone (a page from the last build asking for its chunks) is a plain 404, not the page.
    const named = fileFor(url.pathname);
    if (!named && url.pathname.startsWith("/assets/")) return send(res, 404, TEXT, "Not found.");
    const file = named ?? fileAt(join(root, "index.html"));
    if (!file) return send(res, 404, TEXT, "The dashboard isn't built. Run: pnpm -C apps/dashboard build");
    res.writeHead(200, {
      ...BASE_HEADERS,
      "content-type": TYPES[extname(file.path)] ?? "application/octet-stream",
      "content-length": file.size,
      "cache-control": file.path.startsWith(assets) ? "public, max-age=31536000, immutable" : "no-cache",
    });
    if (req.method === "HEAD") return res.end();
    pipeline(createReadStream(file.path), res, (e) => {
      if (e && (e as NodeJS.ErrnoException).code !== "ERR_STREAM_PREMATURE_CLOSE") opts.log("web-error", { error: e.message });
    });
  };

  /** A file (not a folder) and its size, or null. */
  const fileAt = (path: string): { path: string; size: number } | null => {
    try {
      const st = statSync(path);
      return st.isFile() ? { path, size: st.size } : null;
    } catch {
      return null;
    }
  };

  /** The file a path names inside the root, if it's a file there. Never anything outside it. */
  const fileFor = (pathname: string): { path: string; size: number } | null => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return null;
    }
    const file = normalize(join(root, decoded));
    if (file !== root && !file.startsWith(root + sep)) return null;
    return fileAt(file);
  };

  server.listen(opts.port, opts.bind, () => opts.log("web-listening", { bind: opts.bind, port: opts.port, root }));
  return server;
}

/** The host the visitor used, without its port: only characters a host name or address can have. */
export function visitorHost(req: Pick<IncomingMessage, "headers">): string {
  const host = String(req.headers.host ?? "").replace(/:\d+$/, "");
  return /^[\w.-]+$|^\[[0-9a-f:.]+\]$/i.test(host) ? host : "localhost";
}

function send(res: ServerResponse, status: number, type: string, body: string, headers: Record<string, string> = {}) {
  res.writeHead(status, { ...BASE_HEADERS, "content-type": type, "content-length": Buffer.byteLength(body), ...headers });
  res.end(body);
}
