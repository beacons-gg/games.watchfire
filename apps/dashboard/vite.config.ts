import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `pnpm dashboard` serves this with live reload; /api goes to a door running locally (`pnpm door`,
// which serves the built site and /api/world on :8080).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:8080" } },
  // The map's shapes (Natural Earth 1:50m, ~240 KB gzipped) are one lazy chunk on purpose.
  build: { outDir: "dist", emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 800 },
});
