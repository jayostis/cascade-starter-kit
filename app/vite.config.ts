import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { cascade } from "./vite/cascade.ts";

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), react(), cascade({ browser: mode === "browser" })],
}));
