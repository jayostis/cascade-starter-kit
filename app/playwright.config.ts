import { defineConfig } from "@playwright/test";

const PORT = 3123;

export default defineConfig({
  testDir: "e2e",
  webServer: {
    command: "npm start",
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/`,
    timeout: 180_000,
  },
  use: { baseURL: `http://127.0.0.1:${PORT}` },
});
