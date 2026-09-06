import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base: "./"` keeps every asset reference relative, so the built `dist/` works
// no matter what path it is served from (a bare static host, a sub-folder, or
// whatever URL Telegram is pointed at) without a rebuild.
export default defineConfig({
  plugins: [react()],
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
