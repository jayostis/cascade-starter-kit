import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { cascade } from "./vite/cascade.ts";

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), react(), cascade({ browser: mode === "browser" })],
  // The chat add-on's window is already its own chunk, loaded after the page; the AI SDK in it is 583 kB.
  build: { chunkSizeWarningLimit: 650 },
}));
