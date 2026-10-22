import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { cascade } from "./vite/cascade.ts";

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), react(), cascade({ browser: mode === "browser" })],
  // With the chat add-on, its window is already its own lazy chunk (583 kB: mostly assistant-ui and zod, the AI SDK is about 140 kB of it).
  build: { chunkSizeWarningLimit: 650 },
}));
