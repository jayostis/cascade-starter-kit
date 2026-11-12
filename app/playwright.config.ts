import { defineConfig } from "@playwright/test";

const PORT = 3123;

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 120_000 },
  webServer: {
    command: "npm start",
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/`,
    // The address the app prints carries the token the page trades for its cookie: the test opens it, as a person does.
    wait: { stdout: /(?<LAUNCH>http:\/\/127\.0\.0\.1:\d+\/\?launch=\S+)/ },
    timeout: 180_000,
  },
  use: { baseURL: `http://127.0.0.1:${PORT}` },
});
