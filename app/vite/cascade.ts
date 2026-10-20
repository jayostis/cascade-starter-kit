// What a build of the app carries beside its bundle. Both targets: what the About box says, on the body. The browser
// target (`--mode browser`), which runs PodApi in the page: the installed cascade-runtime's browser build and the
// components it reads, served as files under the base and imported by the import map, outside the bundle, so it
// keeps its own `import.meta.url`; the demo hospitals' service worker, unhashed at the base so that its scope is the
// app's, with one data file per hospital; the demo people and hospitals the page reads; the page a sign-in returns to;
// and the samples the first visit copies, named on the body.
import { existsSync, readFileSync } from "node:fs";
import { cp, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { env } from "node:process";
import { fileURLToPath } from "node:url";
import { brandsBundle, hospitalId } from "@the-cascade-protocol/sandbox";
import { loadHospitals } from "@the-cascade-protocol/sandbox/node";
import { build, type HtmlTagDescriptor, type Plugin } from "vite";
import { demoPeople } from "../said.ts";

/** Where the runtime's files go under the base, as `configureRuntime({ base })` names them. */
export const RUNTIME = "cascade-runtime/";
export const WORKER = "demo-hospital-worker.js";
const WORKER_DATA = "demo-hospitals/";
const APP = fileURLToPath(new URL("../", import.meta.url));

/** The folder of the installed `cascade-runtime`, found from where its main entry resolves. */
function runtimeFolder(): string {
  let folder = dirname(fileURLToPath(import.meta.resolve("cascade-runtime")));
  for (;;) {
    const file = join(folder, "package.json");
    if (
      existsSync(file) &&
      (JSON.parse(readFileSync(file, "utf8")) as { name?: string }).name ===
        "cascade-runtime"
    )
      return folder;
    const parent = dirname(folder);
    if (parent === folder)
      throw new Error(
        "No package.json named cascade-runtime is above where it resolves; run npm install.",
      );
    folder = parent;
  }
}

const json = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, "utf8")) as T;

/** What a page reads of the installed package, by its path under the package: its browser build and components. */
async function served(folder: string): Promise<string[]> {
  const packed = await json<{
    components: { repository: string; commit: string }[];
  }>(join(folder, "components/packed.json"));
  const trees = [
    "components/tables",
    ...packed.components.map(
      ({ repository, commit }) =>
        `components/${repository.split("/").at(-1)}/${commit}`,
    ),
  ];
  const paths = ["components/cascade-runtime.json", "components/packed.json"];
  for (const tree of trees) {
    const listed = await json<string[]>(join(folder, tree, "files.json"));
    paths.push(
      `${tree}.json`,
      `${tree}/files.json`,
      ...listed.map((path) => `${tree}/${path}`),
    );
  }
  return paths;
}

/** The demo hospitals' service worker, one classic script. */
async function workerScript(): Promise<string> {
  const output = await build({
    configFile: false,
    logLevel: "warn",
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          import.meta.resolve("@the-cascade-protocol/sandbox/web/worker"),
        ),
        formats: ["iife"],
        name: "demoHospitals",
      },
    },
  });
  const [built] = Array.isArray(output) ? output : [output];
  const chunk =
    built !== undefined && "output" in built ? built.output[0] : undefined;
  if (chunk?.type !== "chunk") throw new Error("the worker built no script");
  return chunk.code;
}

const escaped = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");

const importMap = (runtime: string): HtmlTagDescriptor => ({
  tag: "script",
  attrs: { type: "importmap" },
  children: JSON.stringify({
    imports: { "cascade-runtime": `${runtime}index.js` },
  }),
  injectTo: "head-prepend",
});

const signedIn = (runtime: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Signing in</title>
<script type="importmap">${JSON.stringify({ imports: { "cascade-runtime": `${runtime}index.js` } })}</script>
<script type="module">import { finishSignIn } from "cascade-runtime"; finishSignIn();</script>
</head>
<body>
<main><p>Signing you in…</p></main>
</body>
</html>
`;

/**
 * The plugin, for the browser target when `browser`. `CASCADE_NAME` and `CASCADE_VERSION` name the app and what it
 * was built from in its About box (the app's package by default), and `CASCADE_SAMPLES` the samples a first visit
 * copies, by folder, beside the base.
 */
export function cascade({ browser }: { browser: boolean }): Plugin {
  const folder = runtimeFolder();
  let base = "/";
  let out = "";
  return {
    name: "cascade",
    config: () =>
      browser
        ? { build: { rolldownOptions: { external: ["cascade-runtime"] } } }
        : {},
    configResolved(config) {
      base = config.base;
      out = resolve(config.root, config.build.outDir);
    },
    async transformIndexHtml(html) {
      const [app, runtime] = await Promise.all([
        json<{ name: string; version: string }>(join(APP, "package.json")),
        json<{ version: string }>(join(folder, "package.json")),
      ]);
      const body: Record<string, string> = {
        "data-name": env.CASCADE_NAME ?? app.name,
        "data-version": env.CASCADE_VERSION ?? app.version,
        "data-runtime": runtime.version,
        ...(browser && { "data-samples": env.CASCADE_SAMPLES ?? "" }),
      };
      const attributes = Object.entries(body)
        .map(([name, value]) => ` ${name}="${escaped(value)}"`)
        .join("");
      return {
        html: html.replace(/<body([^>]*)>/, `<body$1${attributes}>`),
        tags: browser ? [importMap(`${base}${RUNTIME}`)] : [],
      };
    },
    async generateBundle() {
      if (!browser) return;
      const hospitals = await loadHospitals();
      const emit = (fileName: string, source: string) =>
        this.emitFile({ type: "asset", fileName, source });
      emit(WORKER, await workerScript());
      for (const loaded of hospitals)
        emit(
          `${WORKER_DATA}${hospitalId(loaded)}.json`,
          JSON.stringify(loaded),
        );
      emit(
        "demo-brands.json",
        JSON.stringify(
          brandsBundle(
            hospitals.map(({ hospital }) => hospital),
            new Date().toISOString(),
          ),
        ),
      );
      emit("demo-people.json", JSON.stringify(demoPeople(hospitals)));
      emit("signed-in.html", signedIn(`./${RUNTIME}`));
    },
    async writeBundle() {
      if (!browser) return;
      await cp(join(folder, "dist", "browser"), join(out, RUNTIME), {
        recursive: true,
      });
      for (const path of await served(folder))
        await cp(join(folder, path), join(out, RUNTIME, path));
    },
  };
}
