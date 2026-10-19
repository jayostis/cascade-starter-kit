// `node scripts/pin.mjs <commit>`: the template's one pin moved onto runtime-js's build-<commit> pre-release, and the
// lock rewritten by npm to match. The checks of the pull request that carries it test the new build.
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import process, { argv, exit, stderr, stdout } from "node:process";
import { URL } from "node:url";

const ROOT = new URL("../", import.meta.url);
const TEMPLATE = new URL("app/package.json", ROOT);

const commit = argv[2];
if (argv.length !== 3 || !/^[0-9a-f]{40}$/.test(commit ?? "")) {
  stderr.write("usage: node scripts/pin.mjs <runtime-js commit, 40 hex>\n");
  exit(2);
}
const manifest = JSON.parse(await readFile(TEMPLATE, "utf8"));
const pin = manifest.dependencies["cascade-runtime"];
const pinned =
  /\/build-([0-9a-f]{40})\/cascade-runtime-0\.0\.0-commit-\1\.tgz$/.exec(pin);
if (pinned === null)
  throw new Error(`the pin ${pin} is no build-<commit> tarball`);
manifest.dependencies["cascade-runtime"] = pin.replaceAll(pinned[1], commit);
await writeFile(TEMPLATE, `${JSON.stringify(manifest, null, 2)}\n`);
// npm installs a workspace's changed dependency under the workspace, out of the root's reach, unless the lock has
// forgotten where the old one was.
const LOCK = new URL("package-lock.json", ROOT);
const lock = JSON.parse(await readFile(LOCK, "utf8"));
for (const path of Object.keys(lock.packages))
  if (/(^|\/)node_modules\/cascade-runtime(\/|$)/.test(path))
    delete lock.packages[path];
await writeFile(LOCK, `${JSON.stringify(lock, null, 2)}\n`);
stdout.write(
  `cascade-runtime: ${pin}\n              -> ${manifest.dependencies["cascade-runtime"]}\n`,
);
const npm = spawnSync("npm install --no-audit --no-fund", {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
});
process.exitCode = npm.status ?? 1;
