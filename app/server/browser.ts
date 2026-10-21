// `npm run browser`: the app built to run in a browser alone into `dist-browser/`, PodApi in the page over the
// runtime's browser build and the pods kept in the browser, with the kits' samples a first visit copies beside it,
// served at http://127.0.0.1:3000/ (`PORT` to change it). Nothing here answers `/api/`: the page asks no server.
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import process, { env, exit, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { getRequestListener } from "@hono/node-server";
import type { HttpBindings } from "@hono/node-server";
import {
  publishedSamples,
  type Pod,
  type Tables,
} from "cascade-runtime/published";
import { Hono } from "hono";
import { build } from "vite";
import { podApi } from "../pod-api.mjs";
import type { Operations } from "./api.ts";
import { withPages } from "./app.ts";

const APP = fileURLToPath(new URL("../", import.meta.url));
const OUT = join(APP, "dist-browser");
const SAMPLE = "pod";

/**
 * What the pod's page asks the tables of it, asked as the page asks it, through PodApi, so a copy draws its names
 * before the engine; a lookup PodApi swallows into `unsaid` fails the build.
 */
async function looks(pod: Pod, tables: Tables): Promise<void> {
  const failed: unknown[] = [];
  const api = podApi({
    pods: {
      names: async () => [SAMPLE],
      title: async () => undefined,
      open: async () => pod,
    },
    tables: async () => tables,
    opensEncrypted: true,
    unsaid: (_kind: string, error: unknown) => {
      failed.push(error);
    },
  } as never) as unknown as Operations;
  await api.said({ pod: SAMPLE });
  if (failed.length > 0)
    throw new AggregateError(
      failed,
      "the samples' first-paint lookups could not be recorded",
    );
}

stdout.write("Making the kits' samples, which a first visit copies…\n");
const samples = await publishedSamples({ look: looks });
stdout.write("Building the app for a browser into dist-browser/…\n");
env.CASCADE_SAMPLES = [...samples.kits.keys()].join(" ");
await build({
  root: APP,
  mode: "browser",
  logLevel: "warn",
  build: { outDir: OUT, emptyOutDir: true },
});
for (const [path, bytes] of samples.files) {
  const file = join(OUT, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

const app = withPages(new Hono<{ Bindings: HttpBindings }>(), OUT);
app.notFound((c) => c.text("Not found", 404));
const server = createServer(getRequestListener(app.fetch));
server.listen(Number(env.PORT || 3000), "127.0.0.1", () => {
  const { port } = server.address() as AddressInfo;
  stdout.write(`http://127.0.0.1:${port}/\n`);
});

function stop() {
  server.close();
  exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
