// `npm start`: the app built into `dist/` (again when a file it is built from is newer), served at
// http://127.0.0.1:3000/ (`PORT` to change it), with PodApi over the pods in `pods/` at `/api/`, the chat at `/chat`
// and the demo hospitals on a loopback port of their own. `npm run dev` (`--dev`) serves the app's sources through Vite
// instead, in the same process, rebuilt on every save.
import { existsSync, readdirSync, statSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import process, { argv, env, exit, stderr, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { getRequestListener } from "@hono/node-server";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { createServer } from "node:http";
import { HospitalDataError } from "@the-cascade-protocol/sandbox";
import {
  DEFAULT_ROOTS,
  loadHospitals,
  serveDemo,
} from "@the-cascade-protocol/sandbox/node";
import { Refusal } from "cascade-runtime";
import { modelFrom } from "../models.ts";
import { nodeHospitals, nodeHost } from "../node-host.mjs";
import { podApi } from "../pod-api.mjs";
import { PODS } from "../pods.mjs";
import { demoPeople, worldInstant } from "../said.ts";
import type { Operations } from "./api.ts";
import { appServer, type Served } from "./app.ts";
import { chatRoutes, type PodApi } from "./chat.ts";
import type { Own } from "./guard.ts";

const APP = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(APP, "dist");
/** What the app's pages are built from, by their paths in the app. */
const SOURCES = [
  "index.html",
  "src",
  "said.ts",
  "addresses.ts",
  "vite.config.ts",
  "vite",
];
const told = new Set<string>();

/** When the newest file at `path` was written, a folder's files included; 0 when there is none. */
function newest(path: string): number {
  if (!existsSync(path)) return 0;
  const stats = statSync(path);
  if (!stats.isDirectory()) return stats.mtimeMs;
  return Math.max(
    0,
    ...readdirSync(path, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => statSync(join(entry.parentPath, entry.name)).mtimeMs),
  );
}

/** The pages built into `dist/` when it has none, or a file they are built from was written since. */
async function builtPages() {
  const built = newest(join(DIST, "index.html"));
  if (built > 0 && SOURCES.every((path) => newest(join(APP, path)) <= built))
    return;
  stdout.write("Building the app's pages into dist/…\n");
  const { build } = await import("vite");
  await build({ root: APP, logLevel: "warn" });
}

/** Says once on the console, for each kind, that the tables could not say what the pages would name. */
function unsaid(kind: string, error: Error) {
  if (told.has(kind)) return;
  told.add(kind);
  stderr.write(
    kind === "names"
      ? `Records are shown by their own names: ${error.message}\n`
      : `What ClinVar says is not shown: ${error.message}\n`,
  );
}

/** The package's hospitals and people and this app's, or the app stopped with what is wrong with one of the app's. */
async function hospitalsHeld() {
  try {
    return await loadHospitals({
      hospitals: [
        ...DEFAULT_ROOTS.hospitals,
        fileURLToPath(new URL("../hospitals/", import.meta.url)),
      ],
      people: [
        ...DEFAULT_ROOTS.people,
        fileURLToPath(new URL("../people/", import.meta.url)),
      ],
    });
  } catch (error) {
    if (!(error instanceof HospitalDataError)) throw error;
    stderr.write(
      `A hospital in hospitals/ or a person in people/ cannot be used. ${error.message}\n`,
    );
    exit(1);
  }
}

/** The world's date the app starts with, `CASCADE_WORLD_DATE`, read once; a value that is no date stops the app. */
function startingDate(): string | undefined {
  const text = env.CASCADE_WORLD_DATE;
  if (text === undefined || text.trim() === "") return undefined;
  const asOf = worldInstant(text);
  if (asOf === undefined) {
    stderr.write(
      `CASCADE_WORLD_DATE is "${text}", which is neither a day as YYYY-MM-DD nor an instant with a timezone.\n`,
    );
    exit(1);
  }
  return asOf;
}

/** The model the app was set up with (`npm run model`), or none, a setting the client refuses said on the console. */
function modelSet() {
  try {
    return modelFrom();
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    stderr.write(`No model is used: ${error.message}\n`);
    return undefined;
  }
}

const host = nodeHost({ folder: PODS, unsaid });
const api = podApi(host);
const demo = await hospitalsHeld();
const people = demoPeople(demo);
const startedAsOf = startingDate();
const model = modelSet();
let own: Own = { hosts: new Set(), origins: new Set() };
let back: Served["back"] = () => undefined;

const dev = argv.includes("--dev");
if (!dev) await builtPages();
const vite = dev
  ? await (
      await import("vite")
    ).createServer({
      root: APP,
      server: { middlewareMode: true },
      appType: "spa",
    })
  : undefined;

const app = appServer({
  api: api as unknown as Operations,
  own: () => own,
  chat: chatRoutes({ api: api as unknown as PodApi, model }),
  back: (url) => back(url),
  people: () => people,
  pages:
    vite === undefined
      ? DIST
      : async (c) => {
          await new Promise<void>((resolve) => {
            c.env.outgoing.once("close", resolve);
            vite.middlewares(c.env.incoming, c.env.outgoing, () => {
              c.env.outgoing.writeHead(404).end();
            });
          });
          return RESPONSE_ALREADY_SENT;
        },
});

const listener = await serveDemo(demo, { asOf: startedAsOf });
const server = createServer(getRequestListener(app.fetch));
server.listen(Number(env.PORT || 3000), "127.0.0.1", () => {
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;
  own = {
    hosts: new Set([`127.0.0.1:${port}`, `localhost:${port}`]),
    origins: new Set([origin, `http://localhost:${port}`]),
  };
  const reached = nodeHospitals(origin, demo, { asOf: startedAsOf, listener });
  Object.assign(host, { hospitals: reached.hospitals, world: reached.world });
  back = reached.back;
  stdout.write(`${origin}/\n`);
  stdout.write(`The demo hospitals are listening at ${listener.origin}/\n`);
});

async function stop() {
  await listener.close();
  await vite?.close();
  server.close();
  await api.close();
  exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
