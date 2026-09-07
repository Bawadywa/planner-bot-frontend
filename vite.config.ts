import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base: "./"` keeps every asset reference relative, so the built `dist/` works
// no matter what path it is served from (a bare static host, a sub-folder, or
// whatever URL Telegram is pointed at) without a rebuild.
/* config.js deliberately keeps a stable filename so a deployed build can be
   repointed by editing one file. The cost is that it is the ONE asset the
   browser may serve from cache while every hashed file around it updates -
   which is exactly how a stale BOT_USERNAME survives a deploy and hands out
   invite links for the wrong bot. Stamping the reference per build makes each
   deploy fetch it fresh, without touching the edit-in-place workflow. */
const stampRuntimeConfig = () => ({
  name: "stamp-runtime-config",
  transformIndexHtml(html: string) {
    return html.replace(
      'src="./config.js"',
      `src="./config.js?v=${Date.now().toString(36)}"`,
    );
  },
});

export default defineConfig({
  plugins: [react(), stampRuntimeConfig()],
  base: "./",
  build: {
    outDir: "dist",
    target: "es2020",
    assetsDir: "assets",
  },
  server: {
    host: true,
    port: 5173,
  },
});
