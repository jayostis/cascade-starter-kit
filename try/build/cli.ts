import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { env } from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import {
  publishedSamples,
  type Pod,
  type Tables,
} from "cascade-runtime/published";
import { build } from "vite";
import { servePages } from "./serve.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
/** What the samples carry for a first paint, as the app's own `npm run browser` makes them. */
const { looks } = (await import(
  new URL("../../../app/server/samples.ts", import.meta.url).href
)) as { looks(pod: Pod, tables: Tables): Promise<void> };
const PAGES = join(ROOT, "build", "pages");
/** The app's browser target, at the base Pages serves it under, which `CASCADE_TRY_BASE` sets. */
const TRY = "try";
const APP = join(ROOT, "app");

/** The commit the pages are built from, as try/'s About gives it. */
async function builtFrom(): Promise<string> {
  const git = (...args: string[]) =>
    promisify(execFile)("git", args, { cwd: ROOT }).then(({ stdout }) =>
      stdout.trim(),
    );
  const [commit, status] = await Promise.all([
    git("rev-parse", "HEAD"),
    git("status", "--porcelain"),
  ]);
  const uncommitted = status === "" ? 0 : status.split("\n").length;
  return `${commit.slice(0, 12)}${uncommitted === 0 ? "" : `, with ${uncommitted} uncommitted files`}`;
}

const REDIRECT = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=${TRY}/">
<title>Cascade in your browser</title>
</head>
<body>
<p><a href="${TRY}/">Cascade in your browser</a></p>
</body>
</html>
`;

/**
 * The app's browser build in build/pages/try/, by its own Vite config, offering the samples published beside it; its
 * page is also the site's `404.html`, which Pages answers a path with no file with, so a screen's address opens it.
 */
async function buildTry(samples: readonly string[], version: string) {
  Object.assign(env, {
    CASCADE_NAME: "Cascade try",
    CASCADE_VERSION: version,
    CASCADE_CODE: "https://github.com/jayostis/cascade-starter-kit",
    CASCADE_SAMPLES: samples.join(" "),
  });
  await build({
    root: APP,
    configFile: join(APP, "vite.config.ts"),
    mode: "browser",
    base: env.CASCADE_TRY_BASE ?? `/${TRY}/`,
    logLevel: "warn",
    build: { outDir: join(PAGES, TRY), emptyOutDir: true },
  });
  await copyFile(join(PAGES, TRY, "index.html"), join(PAGES, "404.html"));
}

/** Writes build/pages: each kit's sample where try/ copies it from, the app's browser build in try/, and a root page that sends a visitor to try/. */
async function buildPages(): Promise<number> {
  const samples = await publishedSamples({ look: looks });
  const version = await builtFrom();
  const tree = new Map<string, Uint8Array>(samples.files);
  tree.set("index.html", new TextEncoder().encode(REDIRECT));
  await rm(PAGES, { recursive: true, force: true });
  for (const [path, bytes] of tree) {
    const file = join(PAGES, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  await buildTry([...samples.kits.keys()], version);
  console.error(`${tree.size} files and ${TRY}/ written to ${PAGES}`);
  return 0;
}

/** Serves build/pages until stopped. */
async function servePagesCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({ args, options: { port: { type: "string" } } });
  if (!existsSync(join(PAGES, "index.html")))
    throw new Error(`${PAGES} holds no pages; run npm run build:try first`);
  const { url } = await servePages(PAGES, Number(values.port ?? 0));
  console.log(`serving ${PAGES} at ${url}`);
  await new Promise(() => undefined);
  return 0;
}

const COMMANDS: Record<string, (args: string[]) => Promise<number>> = {
  "build-pages": buildPages,
  "serve-pages": servePagesCommand,
};

const [command = "", ...args] = process.argv.slice(2);
const run = COMMANDS[command];
if (run === undefined) {
  console.error(`usage: cli.js ${Object.keys(COMMANDS).join(" | ")} ...`);
  process.exitCode = 2;
} else {
  try {
    process.exitCode = await run(args);
  } catch (error) {
    console.error(
      `${command}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
