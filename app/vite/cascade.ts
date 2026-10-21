// What a build of the app carries beside its bundle. Both targets: what the About box says, on the body. The browser
// target (`--mode browser`), which runs PodApi in the page: the installed cascade-runtime's browser build, served by
// `cascade-runtime/vite`; and what stays the app's: the demo hospitals' service worker, unhashed at the base so that
// its scope is the app's, with one data file per hospital; the demo people and hospitals the page reads; the page a
// sign-in returns to; and the samples the first visit copies, named on the body.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "node:process";
import { fileURLToPath } from "node:url";
import { brandsBundle, hospitalId } from "@the-cascade-protocol/sandbox";
import { loadHospitals } from "@the-cascade-protocol/sandbox/node";
import runtimePackage from "cascade-runtime/package.json" with { type: "json" };
import { cascadeRuntime, RUNTIME_FOLDER } from "cascade-runtime/vite";
import { build, type Plugin } from "vite";
import { demoPeople } from "../said.ts";

export const WORKER = "demo-hospital-worker.js";
const WORKER_DATA = "demo-hospitals/";
const APP = fileURLToPath(new URL("../", import.meta.url));

const json = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, "utf8")) as T;

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
 * The plugin, for the browser target when `browser`. `CASCADE_NAME`, `CASCADE_VERSION` and `CASCADE_CODE` name the
 * app, what it was built from and where its code is, in its About box (the app's package by default; no link when it
 * names none), and `CASCADE_SAMPLES` the samples a first visit
 * copies, by folder, beside the base.
 */
export function cascade({ browser }: { browser: boolean }): Plugin[] {
  return [cascadeRuntime({ browser }), appPlugin({ browser })];
}

function appPlugin({ browser }: { browser: boolean }): Plugin {
  return {
    name: "cascade",
    async transformIndexHtml(html) {
      const app = await json<{
        name: string;
        version: string;
        repository?: string | { url?: string };
        homepage?: string;
      }>(join(APP, "package.json"));
      const body: Record<string, string> = {
        "data-name": env.CASCADE_NAME ?? app.name,
        "data-version": env.CASCADE_VERSION ?? app.version,
        "data-runtime": runtimePackage.version,
        "data-code":
          env.CASCADE_CODE ??
          (typeof app.repository === "string"
            ? app.repository
            : app.repository?.url) ??
          app.homepage ??
          "",
        ...(browser && { "data-samples": env.CASCADE_SAMPLES ?? "" }),
      };
      const attributes = Object.entries(body)
        .map(([name, value]) => ` ${name}="${escaped(value)}"`)
        .join("");
      return html.replace(/<body([^>]*)>/, `<body$1${attributes}>`);
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
      emit("signed-in.html", signedIn(`./${RUNTIME_FOLDER}`));
    },
  };
}
