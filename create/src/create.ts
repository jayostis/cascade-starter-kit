import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { cp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  basename,
  dirname,
  join,
  relative,
  resolve as absolute,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { Phase } from "cascade-runtime/fixtures";

/** The repository's root, or the packed package's, this file being compiled to `dist/create/src/` in both. */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const STARTER = join(ROOT, "app");
const COMMAND = "create-cascade-app";
const RELEASES =
  "https://github.com/jayostis/cascade-starter-kit/releases/download";
const PROJECT_NAME = /^[a-z0-9][a-z0-9._-]*$/;
const USAGE = `usage: ${COMMAND} <folder> [--tarball <address>]`;
/** The kits whose pods a made app starts with, in the order they are loaded; the starter's `npm run reset` loads the same. */
export const KITS = [
  "alex-rivera",
  "priya-natarajan",
  "martin-okafor",
  "tamsin-vale",
] as const;

/** What `create` uses of a made app's `cascade-runtime/fixtures`. */
export interface Fixtures {
  readonly phaseOn: (out: (text: string) => void) => Phase;
  readonly seconds: (started: number) => string;
  /** Sets up the app's tables in the pods folder, rejecting with why it could not: the kits then try on their own. */
  readonly setUpTables: (pods: string, phase: Phase) => Promise<unknown>;
  /** Replays the kit's story into the folder, rejecting with why it could not. */
  readonly replayKit: (kit: string, folder: string) => Promise<unknown>;
}

export interface Terminal {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
  /** Asks the person for the folder's name; absent when no person is at a terminal. */
  readonly ask?: () => Promise<string>;
  /** Installs the project's dependencies in the folder, resolving whether it succeeded. */
  readonly install: (folder: string) => Promise<boolean>;
  /** The installed project's own fixtures, which set up its tables and load its kits on the runtime it installed. */
  readonly fixtures: (folder: string) => Promise<Fixtures>;
  /** Offers to connect a model in the made app and runs the app's `npm run model` when taken up; absent when no person is at a terminal. Resolves whether a model was set up. */
  readonly model?: (folder: string) => Promise<boolean>;
}

/** The word as a shell reads it: quoted when it holds a space or a character a shell would act on. */
function shellWord(word: string): string {
  return /^[\w@%+=:,./\\-]+$/.test(word)
    ? word
    : `"${word.replaceAll('"', '\\"')}"`;
}

/** The one line that makes an app in the folder from the package at the address. */
export function startLine(address: string, folder: string): string {
  return `npx --yes --package=${shellWord(address)} ${COMMAND} ${shellWord(folder)}`;
}

/** Where the pre-release of the commit's build serves this package's tarball, whether or not that release exists yet. */
export function releaseAddress(commit: string): string {
  return `${RELEASES}/build-${commit}/${COMMAND}-0.0.0-commit-${commit}.tgz`;
}

/** What a person gives a coding agent, started in the folder holding the made app, to build their app in it. */
export function agentPrompt(folder: string): string {
  return [
    `Build me an app on a Cascade pod. Work inside ${folder}: read its AGENTS.md first and follow it, and use only what its guide teaches.`,
    "My idea: <describe your idea in a sentence>",
  ].join("\n");
}

/** How a project depends on the package at the address: a URL as it is, a file by its absolute path. */
function dependencyOn(address: string): string {
  return /^[a-z][a-z0-9+.-]+:/i.test(address)
    ? address
    : `file:${absolute(address).replaceAll("\\", "/")}`;
}

/** The `cascade-runtime/fixtures` the project in the folder installed. */
export async function fixturesOf(folder: string): Promise<Fixtures> {
  const path = createRequire(join(folder, "package.json")).resolve(
    "cascade-runtime/fixtures",
  );
  return (await import(pathToFileURL(path).href)) as Fixtures;
}

/** Why the folder cannot be made into a project, or nothing. */
async function unusable(target: string): Promise<string | undefined> {
  const name = basename(target);
  if (!PROJECT_NAME.test(name) || name.length > 214)
    return `${name} is no project name: use lower-case letters, digits, ".", "_" and "-", starting with a letter or digit`;
  if (!existsSync(target)) return undefined;
  if (!statSync(target).isDirectory()) return `${target} is a file`;
  if ((await readdir(target)).length > 0) return `${target} is not empty`;
  return undefined;
}

async function rewrite(
  path: string,
  change: (text: string) => string,
): Promise<void> {
  await writeFile(path, change(await readFile(path, "utf8")));
}

async function copyStarter(
  target: string,
  name: string,
  runtime: string | undefined,
): Promise<void> {
  await cp(STARTER, target, {
    recursive: true,
    filter: (source) =>
      ![".env", "node_modules", "pods"].includes(relative(STARTER, source)),
  });
  await rename(join(target, "gitignore"), join(target, ".gitignore"));
  await rewrite(join(target, "package.json"), (text) => {
    const manifest = JSON.parse(text) as {
      name: string;
      dependencies: Record<string, string>;
    };
    manifest.name = name;
    if (runtime !== undefined)
      manifest.dependencies["cascade-runtime"] = dependencyOn(runtime);
    return `${JSON.stringify(manifest, null, 2)}\n`;
  });
  await rewrite(join(target, "README.md"), (text) =>
    text.replace(/^# .*$/m, () => `# ${name}`),
  );
}

/** `create-cascade-app <folder> [--tarball <address>]`: the exit code, having written only what it says. */
export async function create(
  args: readonly string[],
  terminal: Terminal,
): Promise<number> {
  const refuse = (reason: string): number => {
    terminal.err(`${reason}\n`);
    return 2;
  };
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22)
    return refuse(
      `${COMMAND} needs Node 22 or later; this is ${process.version}`,
    );
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      options: { tarball: { type: "string" } },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    return refuse(`${(error as Error).message}\n${USAGE}`);
  }
  if (parsed.positionals.length > 1) return refuse(USAGE);
  let folder = parsed.positionals[0];
  if (folder === undefined) {
    if (terminal.ask === undefined) return refuse(USAGE);
    folder = (await terminal.ask()).trim();
    if (folder === "") return refuse("no folder given");
  }
  const target = absolute(folder);
  const reason = await unusable(target);
  if (reason !== undefined) return refuse(reason);

  const name = basename(target);
  try {
    await copyStarter(target, name, parsed.values.tarball);
  } catch (error) {
    terminal.err(
      `the starter could not be copied into ${target}, which may be left half made: ${(error as Error).message}
`,
    );
    return 1;
  }
  if (!(await terminal.install(target))) {
    terminal.err(
      `the install failed; ${target} is left as it is: run \`npm install\` in it\n`,
    );
    return 1;
  }
  let fixtures;
  try {
    fixtures = await terminal.fixtures(target);
  } catch (error) {
    terminal.err(
      `the app is installed, but its cascade-runtime/fixtures could not be loaded: ${(error as Error).message}\nRun \`npm run reset\` in it to load its pods.\n`,
    );
    return 1;
  }
  const { phaseOn, seconds } = fixtures;
  try {
    await fixtures.setUpTables(join(target, "pods"), phaseOn(terminal.out));
  } catch (error) {
    terminal.err(
      `the app's tables could not be set up: ${(error as Error).message}\nThe pods try to load them again.\n`,
    );
  }
  const loaded = [];
  for (const kit of KITS) {
    terminal.out(`\nLoading the pod ${kit}, from the kit the package carries…`);
    const started = performance.now();
    const pod = join(target, "pods", kit);
    try {
      await fixtures.replayKit(kit, pod);
      loaded.push(kit);
      terminal.out(` loaded in ${seconds(started)}\n`);
    } catch (error) {
      await rm(pod, { recursive: true, force: true });
      terminal.out("\n");
      terminal.err(
        `the pod ${kit} did not load: ${(error as Error).message}\nThe app is made; \`npm run reset\` in it loads its pods again.\n`,
      );
    }
  }
  const chat =
    terminal.model === undefined ? undefined : await terminal.model(target);
  terminal.out(
    [
      "",
      `Made ${target}${loaded.length === 0 ? "" : `, with ${loaded.length === 1 ? "the pod" : "the pods"} ${[loaded.slice(0, -1).join(", "), loaded.at(-1)].filter(Boolean).join(" and ")}`}. Start your coding agent in ${dirname(target)}, the folder holding it, and give it this, with your idea in its last line:`,
      "",
      agentPrompt(name),
      "",
      "To run the app yourself instead:",
      "",
      `  cd ${shellWord(folder)}`,
      "  npm start",
      "",
      "then open http://127.0.0.1:3000/. `npm run help` lists the app's commands.",
      ...(chat === false
        ? ["", "`npm run model` connects a model to the app's chat later."]
        : []),
      "",
    ].join("\n"),
  );
  return 0;
}

/** npm with the arguments in the folder, on the terminal: npm's own script when npm ran this, otherwise `npm` through the shell. Resolves whether it succeeded. */
function npm(folder: string, args: readonly string[]): Promise<boolean> {
  const script = process.env.npm_execpath;
  const child =
    script !== undefined && /\.c?js$/.test(script)
      ? spawn(process.execPath, [script, ...args], {
          cwd: folder,
          stdio: "inherit",
        })
      : spawn(["npm", ...args].join(" "), {
          cwd: folder,
          stdio: "inherit",
          shell: true,
        });
  return new Promise((done) => {
    child.on("error", () => done(false));
    child.on("close", (code) => done(code === 0));
  });
}

/** npm's install in the folder, its output shown. */
export function npmInstall(folder: string): Promise<boolean> {
  return npm(folder, ["install"]);
}

/** The made app's `npm run model`, on the terminal. */
export function npmRunModel(folder: string): Promise<boolean> {
  return npm(folder, ["run", "model"]);
}
