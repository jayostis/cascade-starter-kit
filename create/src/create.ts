import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
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
/** The add-ons' registry: a folder each, named for the add-on, holding its `registry-item.json` and its files. */
const ADD_ONS = join(ROOT, "add-ons");
const COMMAND = "create-cascade-app";
const RELEASES =
  "https://github.com/jayostis/cascade-starter-kit/releases/download";
const PROJECT_NAME = /^[a-z0-9][a-z0-9._-]*$/;
const USAGE = `usage: ${COMMAND} <folder> [--with <add-on>,…] [--tarball <address>]`;
/** What the template holds that a made app does not get: what an app makes or installs, and its secrets. */
export const LEFT_OUT = [
  ".env",
  "dist",
  "dist-browser",
  "node_modules",
  "pods",
];
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
  /** The version of the Node.js the made app will run on, as `process.version` gives it; this one's when absent. */
  readonly node?: string;
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
  /** Asks the person for the folder's name; absent when no person is at a terminal. */
  readonly ask?: () => Promise<string>;
  /** Installs the project's dependencies in the folder, resolving whether it succeeded. */
  readonly install: (folder: string) => Promise<boolean>;
  /** The installed project's own fixtures, which set up its tables and load its kits on the runtime it installed. */
  readonly fixtures: (folder: string) => Promise<Fixtures>;
  /** Asks the person which of the add-ons to add, by name, none unless they name one; absent when no person is at a terminal. */
  readonly choose?: (
    addOns: readonly Pick<AddOn, "name" | "description">[],
  ) => Promise<readonly string[]>;
  /** Offers to connect a model in the made app and runs the app's `npm run model` when taken up; absent when no person is at a terminal. Resolves whether a model was set up. */
  readonly model?: (folder: string) => Promise<boolean>;
}

/**
 * An add-on as its `registry-item.json` holds it, in shadcn's registry-item shape: each file's `path` is from the
 * registry's folder and its `target` from the app's. `meta` holds what the shape has no field for: the npm scripts it
 * adds, their lines in `help.json`, and the documents whose sections it adds to (the app's file, then its part's path).
 */
export interface AddOn {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly dependencies?: readonly string[];
  readonly devDependencies?: readonly string[];
  readonly files: readonly {
    readonly path: string;
    readonly type: string;
    readonly target: string;
  }[];
  readonly meta?: {
    readonly scripts?: Readonly<Record<string, string>>;
    readonly help?: Readonly<Record<string, readonly [string, string]>>;
    readonly merge?: Readonly<Record<string, string>>;
  };
}

/** The add-ons of the registry, by name. */
export async function addOns(): Promise<AddOn[]> {
  const folders = (await readdir(ADD_ONS, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => name)
    .sort();
  return Promise.all(
    folders.map(
      async (folder) =>
        JSON.parse(
          await readFile(join(ADD_ONS, folder, "registry-item.json"), "utf8"),
        ) as AddOn,
    ),
  );
}

/** "a", "a and b", "a, b and c". */
function inWords(items: readonly string[]): string {
  return [items.slice(0, -1).join(", "), items.at(-1)]
    .filter(Boolean)
    .join(" and ");
}

/** `name@version`'s two parts, a scope's `@` kept with the name. */
function pinOf(spec: string): [string, string] {
  const at = spec.lastIndexOf("@");
  return [spec.slice(0, at), spec.slice(at + 1)];
}

const byName = (entries: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );

/** The parts of a Markdown document under its `## ` headings, each heading with its lines. */
function sectionsOf(text: string): [string, string[]][] {
  const sections: [string, string[]][] = [];
  for (const line of text.split("\n"))
    if (line.startsWith("## ")) sections.push([line, []]);
    else sections.at(-1)?.[1].push(line);
  return sections;
}

/** `text` with each section of `part` added: at the end of the section of `text` under the same heading, else as a section at its end. */
export function withSections(text: string, part: string): string {
  const lines = text.replace(/\n+$/, "").split("\n");
  for (const [heading, body] of sectionsOf(part)) {
    const trimmed = body
      .join("\n")
      .replace(/^\n+|\n+$/g, "")
      .split("\n");
    const at = lines.indexOf(heading);
    if (at < 0) {
      lines.push("", heading, "", ...trimmed);
      continue;
    }
    let end = lines.findIndex(
      (line, index) => index > at && line.startsWith("## "),
    );
    if (end < 0) end = lines.length;
    while (end > at + 1 && lines[end - 1]?.trim() === "") end -= 1;
    const continuesList =
      trimmed[0]?.startsWith("- ") === true &&
      /^(- | {2})/.test(lines[end - 1] ?? "");
    lines.splice(end, 0, ...(continuesList ? [] : [""]), ...trimmed);
  }
  return `${lines.join("\n")}\n`;
}

/** Adds the add-on to the app in `target`, as shadcn adds a registry item: its files at their targets and its pinned dependencies, then its scripts, their help and its sections of the app's documents. */
export async function addOn(target: string, addOn: AddOn): Promise<void> {
  for (const file of addOn.files) {
    const to = join(target, ...file.target.split("/"));
    await mkdir(dirname(to), { recursive: true });
    await cp(join(ADD_ONS, ...file.path.split("/")), to);
  }
  await rewrite(join(target, "package.json"), (text) => {
    const manifest = JSON.parse(text) as Record<string, Record<string, string>>;
    for (const kind of ["dependencies", "devDependencies"] as const)
      if (addOn[kind] !== undefined)
        manifest[kind] = byName({
          ...manifest[kind],
          ...Object.fromEntries(addOn[kind].map(pinOf)),
        });
    manifest.scripts = { ...manifest.scripts, ...addOn.meta?.scripts };
    return `${JSON.stringify(manifest, null, 2)}\n`;
  });
  if (addOn.meta?.help !== undefined)
    await rewrite(
      join(target, "help.json"),
      (text) =>
        `${JSON.stringify({ ...JSON.parse(text), ...addOn.meta?.help }, null, 2)}\n`,
    );
  for (const [file, part] of Object.entries(addOn.meta?.merge ?? {})) {
    const added = await readFile(join(ADD_ONS, ...part.split("/")), "utf8");
    await rewrite(join(target, file), (text) => withSections(text, added));
  }
}

/** The word as a shell reads it: quoted when it holds a space or a character a shell would act on. */
function shellWord(word: string): string {
  return /^[\w@%+=:,./\\-]+$/.test(word)
    ? word
    : `"${word.replaceAll('"', '\\"')}"`;
}

/**
 * Whether the Node.js of `version` ("v22.18.0") runs a `.ts` file by stripping its types with no flag, as the made app's
 * scripts need: from 22.18.0 on the 22 line, and from 23.6.0 on.
 */
function runsTypeScript(version: string): boolean {
  const [major = 0, minor = 0] = version
    .replace(/^v/, "")
    .split(".")
    .map(Number);
  return (
    major > 23 || (major === 23 && minor >= 6) || (major === 22 && minor >= 18)
  );
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
    filter: (source) => !LEFT_OUT.includes(relative(STARTER, source)),
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

/** `create-cascade-app <folder> [--with <add-on>,…] [--tarball <address>]`: the exit code, having written only what it says. */
export async function create(
  args: readonly string[],
  terminal: Terminal,
): Promise<number> {
  const refuse = (reason: string): number => {
    terminal.err(`${reason}\n`);
    return 2;
  };
  const node = terminal.node ?? process.version;
  if (!runsTypeScript(node))
    return refuse(
      `This app needs Node.js 22.18 or later; you have ${node}. Get it from https://nodejs.org`,
    );
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      options: {
        tarball: { type: "string" },
        with: { type: "string", multiple: true },
      },
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
  const known = await addOns();
  const named =
    parsed.values.with !== undefined
      ? parsed.values.with.flatMap((given) => given.split(","))
      : terminal.choose === undefined
        ? []
        : await terminal.choose(
            known.map(({ name, description }) => ({ name, description })),
          );
  const names = named.map((given) => given.trim()).filter(Boolean);
  const unknown = names.find(
    (given) => !known.some(({ name }) => name === given),
  );
  if (unknown !== undefined)
    return refuse(
      `no add-on named ${unknown}: the add-ons are ${inWords(known.map(({ name }) => name))}`,
    );
  const chosen = known.filter(({ name }) => names.includes(name));

  const name = basename(target);
  try {
    await copyStarter(target, name, parsed.values.tarball);
    for (const each of chosen) await addOn(target, each);
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
      `the app is installed, but its cascade-runtime/fixtures could not be loaded: ${(error as Error).message}\nRun \`npm install\` in it, then \`npm run reset\` to load its pods.\n`,
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
    terminal.model === undefined || !chosen.some(({ name }) => name === "chat")
      ? undefined
      : await terminal.model(target);
  const commands = chosen.flatMap(({ meta }) =>
    Object.values(meta?.help ?? {}),
  );
  const width = Math.max(0, ...commands.map(([command]) => command.length));
  terminal.out(
    [
      "",
      `Made ${target}${loaded.length === 0 ? "" : `, with ${loaded.length === 1 ? "the pod" : "the pods"} ${inWords(loaded)}`}${chosen.length === 0 ? "" : `, and with the ${chosen.length === 1 ? "add-on" : "add-ons"} ${inWords(chosen.map(({ name }) => name))}`}. Start your coding agent in ${dirname(target)}, the folder holding it, and give it this, with your idea in its last line:`,
      "",
      agentPrompt(name),
      "",
      "To run the app yourself instead:",
      "",
      `  cd ${shellWord(folder)}`,
      "  npm start",
      "",
      "then open http://127.0.0.1:3000/: the app on Node, over the pods in pods/. Or, to run it in a browser alone, its pods kept in the browser:",
      "",
      "  npm run browser",
      "",
      "and open the same address. `npm run help` lists the app's commands.",
      ...(commands.length === 0
        ? []
        : [
            "",
            "The add-ons' commands:",
            "",
            ...commands.map(([command, what]) =>
              `  ${command.padEnd(width)}  ${what}`.trimEnd(),
            ),
          ]),
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
