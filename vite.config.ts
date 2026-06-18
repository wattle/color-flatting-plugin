import { defineConfig } from "vite";
import { uxp } from "vite-uxp-plugin";
import react from "@vitejs/plugin-react";

import { config } from "./uxp.config";

const mode = process.env.MODE;
process.env.VITE_BOLT_MODE = mode;
process.env.VITE_BOLT_WEBVIEW_UI = "false";
process.env.VITE_BOLT_WEBVIEW_PORT = "8082";

export default defineConfig({
  plugins: [
    uxp(config, mode),
    react(),
  ],
  build: {
    sourcemap: mode && ["dev", "build"].includes(mode) ? "inline" : false,
    minify: false,
    emptyOutDir: true,
    rollupOptions: {
      external: [
        "photoshop",
        "uxp",
        "fs",
        "os",
        "path",
        "process",
        "shell",
      ],
      output: {
        format: "iife",
      },
    },
  },
  publicDir: "public",
});