// `npm run build:create`: create/ staged in build/create as the package a person's npx fetches, with the template, its
// add-ons and the demo hospital in it, and packed into build/ beside its release notes.
import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { env, execPath, stdout } from "node:process";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";
import {
  LEFT_OUT,
  releaseAddress,
  startLine,
} from "../dist/create/src/create.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const BUILD = join(ROOT, "build");
const STAGE = join(BUILD, "create");
const TEMPLATE = join(ROOT, "app");
const COMPILED = join("dist", "create", "src");
const DEMO_HOSPITAL = "demo-hospital";
const KEPT_BY_BUNDLED = ["name", "version", "type", "exports", "license"];
const run = promisify(execFile);

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = (path, value) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

/** @param {string[]} args */
async function git(...args) {
  return (await run("git", args, { cwd: ROOT })).stdout.trim();
}

/** @param {string} path */
function compiled(path) {
  return (
    statSync(path).isDirectory() ||
    path.endsWith(".js") ||
    path.endsWith(".d.ts")
  );
}

/**
 * The demo hospitals inside the staged template, as a package of the app's own that its `package.json` names by
 * `file:`, so that a made app installs them with no git and no build.
 * @param {string} app
 */
async function packDemoHospital(app) {
  const sandbox = dirname(
    fileURLToPath(
      import.meta.resolve("@the-cascade-protocol/sandbox/package.json"),
    ),
  );
  const manifest = await readJson(join(sandbox, "package.json"));
  const to = join(app, DEMO_HOSPITAL);
  for (const path of manifest.files ?? [])
    await cp(join(sandbox, ...path.split("/")), join(to, ...path.split("/")), {
      recursive: true,
      ...(path.startsWith("dist/") ? { filter: compiled } : {}),
    });
  await writeJson(
    join(to, "package.json"),
    Object.fromEntries(
      KEPT_BY_BUNDLED.filter((field) => field in manifest).map((field) => [
        field,
        manifest[field],
      ]),
    ),
  );
  const template = await readJson(join(app, "package.json"));
  await writeJson(join(app, "package.json"), {
    ...template,
    dependencies: {
      ...template.dependencies,
      [manifest.name]: `file:${DEMO_HOSPITAL}`,
    },
  });
}

async function npmPack() {
  const npm = env.npm_execpath;
  if (npm === undefined)
    throw new Error(
      "npm_execpath is unset: run the pack as `npm run build:create`",
    );
  const { stdout } = await run(
    execPath,
    [npm, "pack", "--json", "--pack-destination", BUILD],
    { cwd: STAGE, maxBuffer: 64 * 1024 * 1024 },
  );
  const [packed] = JSON.parse(stdout);
  if (packed === undefined) throw new Error("npm pack packed nothing");
  return packed;
}

const commit = await git("rev-parse", "HEAD");
const uncommitted = (await git("status", "--porcelain"))
  .split("\n")
  .filter(Boolean).length;
const address = releaseAddress(commit);
const manifest = await readJson(join(ROOT, "create", "package.json"));
const template = await readJson(join(TEMPLATE, "package.json"));

await rm(STAGE, { recursive: true, force: true });
await mkdir(join(STAGE, COMPILED), { recursive: true });
for (const file of ["create.js", "create-cli.js"])
  await cp(join(ROOT, COMPILED, file), join(STAGE, COMPILED, file));
await cp(TEMPLATE, join(STAGE, "app"), {
  recursive: true,
  filter: (source) => !LEFT_OUT.includes(relative(TEMPLATE, source)),
});
await packDemoHospital(join(STAGE, "app"));
await cp(join(ROOT, "add-ons"), join(STAGE, "add-ons"), { recursive: true });
await cp(join(ROOT, "LICENSE"), join(STAGE, "LICENSE"));
await writeJson(join(STAGE, "package.json"), {
  ...manifest,
  version: `0.0.0-commit-${commit}`,
  bin: { [manifest.name]: `${COMPILED.replaceAll("\\", "/")}/create-cli.js` },
  cascadeStarter: { commit, dirty: uncommitted > 0, tarball: address },
});

await mkdir(BUILD, { recursive: true });
for (const file of await readdir(BUILD))
  if (file.startsWith(`${manifest.name}-`) && file.endsWith(".tgz"))
    await rm(join(BUILD, file));
const { filename, integrity } = await npmPack();
if (filename !== basename(new URL(address).pathname))
  throw new Error(`npm packed ${filename}, but the release serves ${address}`);
await writeFile(
  join(BUILD, "release-notes.md"),
  [
    "```sh",
    startLine(address, "my-app"),
    "```",
    "",
    `Built from commit ${commit}. Integrity \`${integrity}\`.`,
    "",
    `A made app runs on cascade-runtime from ${template.dependencies["cascade-runtime"]}.`,
    "",
  ].join("\n"),
);
stdout.write(
  `packed ${join(BUILD, filename)}, from ${commit}${uncommitted > 0 ? ` with ${uncommitted} uncommitted files` : ""}\n`,
);
