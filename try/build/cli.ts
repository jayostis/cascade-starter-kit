import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { publishedSamples } from "cascade-runtime/published";
import { runtimePackageRoot } from "./package-root.js";
import { servePages } from "./serve.js";
import { TRY_PACKAGE } from "./try-page.js";
import { tryFiles, tryLooks } from "./try.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PAGES = join(ROOT, "build", "pages");
const PACKAGE = runtimePackageRoot();
const TRY = "try/";
/** The package's starter copies of the feeds' series, which the samples' answers are computed with. */
const STARTER_TABLES = "components/tables";

interface Packed {
  readonly components: readonly {
    readonly repository: string;
    readonly commit: string;
  }[];
}

/** The files under `folder` of the installed package, by their paths in it. */
async function listed(folder: string): Promise<string[]> {
  const entries = await readdir(join(PACKAGE, folder), {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(PACKAGE, join(entry.parentPath, entry.name)).replaceAll(
        "\\",
        "/",
      ),
    );
}

/**
 * What try/ serves of the installed package, by its path under it: the browser build, the runtime's configuration
 * and the record of what it packed, each packed component's tree, and the starter tables.
 */
async function packageFiles(): Promise<Map<string, Uint8Array>> {
  const packed = JSON.parse(
    await readFile(join(PACKAGE, "components", "packed.json"), "utf8"),
  ) as Packed;
  const paths = [
    ...(await listed("dist/browser")),
    "components/cascade-runtime.json",
    "components/packed.json",
  ];
  for (const { repository, commit } of packed.components) {
    const tree = `components/${repository.split("/").at(-1)}/${commit}`;
    paths.push(`${tree}.json`, ...(await listed(tree)));
  }
  const tables = JSON.parse(
    await readFile(join(PACKAGE, STARTER_TABLES, "files.json"), "utf8"),
  ) as string[];
  paths.push(
    `${STARTER_TABLES}.json`,
    `${STARTER_TABLES}/files.json`,
    ...tables.map((path) => `${STARTER_TABLES}/${path}`),
  );
  return new Map(
    await Promise.all(
      paths.map(
        async (path) =>
          [path, new Uint8Array(await readFile(join(PACKAGE, path)))] as const,
      ),
    ),
  );
}

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
<meta http-equiv="refresh" content="0; url=${TRY}">
<title>Cascade in your browser</title>
</head>
<body>
<p><a href="${TRY}">Cascade in your browser</a></p>
</body>
</html>
`;

/**
 * Writes build/pages: try/ over the installed package, each kit's sample beside it where try/ copies it from, and a
 * root page that sends a visitor to try/.
 */
async function buildPages(): Promise<number> {
  const samples = await publishedSamples({ look: tryLooks });
  const tree = new Map<string, Uint8Array>(samples.files);
  for (const [path, bytes] of await tryFiles(
    [...samples.kits.keys()],
    await builtFrom(),
  ))
    tree.set(TRY + path, bytes);
  for (const [path, bytes] of await packageFiles())
    tree.set(TRY + TRY_PACKAGE + path, bytes);
  tree.set("index.html", new TextEncoder().encode(REDIRECT));
  await rm(PAGES, { recursive: true, force: true });
  for (const [path, bytes] of tree) {
    const file = join(PAGES, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  console.error(`${tree.size} files written to ${PAGES}`);
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
