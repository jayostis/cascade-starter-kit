import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const compiled = readdirSync("test", { recursive: true })
  .filter((entry) => entry.endsWith(".test.ts"))
  .sort()
  .map((entry) => join("dist", "test", entry.slice(0, -3) + ".js"));

const missing = compiled.filter((path) => !existsSync(path));
if (missing.length > 0) {
  process.stderr.write(
    `No compiled test for ${missing.length} listed source(s):\n${missing.join("\n")}\n`,
  );
  process.exit(1);
}

const cache = mkdtempSync(join(tmpdir(), "starter-built-"));
const run = spawnSync(
  process.execPath,
  [
    "--import",
    pathToFileURL(join("dist", "test", "offline.js")).href,
    "--test",
    ...process.argv.slice(2),
    ...compiled,
  ],
  { stdio: "inherit", env: { ...process.env, STARTER_TEST_CACHE: cache } },
);
rmSync(cache, {
  recursive: true,
  force: true,
  maxRetries: 10,
  retryDelay: 100,
});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
