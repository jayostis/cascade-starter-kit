// `node scripts/pin.mjs <commit>`: the template's one pin moved onto runtime-js's build-<commit> pre-release, and the
// lock rewritten by npm to match. The checks of the pull request that carries it test the new build.
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import process, { argv, exit, stderr, stdout } from "node:process";
import { URL } from "node:url";
import { lockWithoutRuntime, pinnedTo } from "./pin-lib.mjs";

const ROOT = new URL("../", import.meta.url);
const TEMPLATE = new URL("app/package.json", ROOT);

const commit = argv[2];
if (argv.length !== 3 || !/^[0-9a-f]{40}$/.test(commit ?? "")) {
  stderr.write("usage: node scripts/pin.mjs <runtime-js commit, 40 hex>\n");
  exit(2);
}
const LOCK = new URL("package-lock.json", ROOT);
const manifestText = await readFile(TEMPLATE, "utf8");
const lockText = await readFile(LOCK, "utf8");
const manifest = JSON.parse(manifestText);
const pin = manifest.dependencies["cascade-runtime"];
try {
  manifest.dependencies["cascade-runtime"] = await pinnedTo(pin, commit);
} catch (error) {
  stderr.write(`${error.message}\n`);
  exit(2);
}
await writeFile(TEMPLATE, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(
  LOCK,
  `${JSON.stringify(lockWithoutRuntime(JSON.parse(lockText)), null, 2)}\n`,
);
stdout.write(
  `cascade-runtime: ${pin}\n              -> ${manifest.dependencies["cascade-runtime"]}\n`,
);
const npm = spawnSync("npm install --no-audit --no-fund", {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
});
if (npm.status !== 0) {
  await writeFile(TEMPLATE, manifestText);
  await writeFile(LOCK, lockText);
  stderr.write(
    "the install failed; app/package.json and the lock are as they were\n",
  );
}
process.exitCode = npm.status ?? 1;
