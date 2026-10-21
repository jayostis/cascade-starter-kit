// The Node target's server: the guard, PodApi at `/api/`, the reads of the tool list at `/tools`, the chat at `/chat`
// when the app has it, a hospital's redirect back at `/callback`, and the built app: its files as they are, and its
// page for any other address a person opens.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type MiddlewareHandler } from "hono";
import { addresses } from "../addresses.ts";
import { apiRoutes, type Operations } from "./api.ts";
import { guard, type Own } from "./guard.ts";
import { toolRoutes } from "./tools.ts";

export interface Served {
  readonly api: Operations;
  /** This server's own addresses, known once it listens. */
  own(): Own;
  /** `GET /chat` and `POST /chat`, when the chat add-on is added (`chat.ts`); without it `/chat` is a 404. */
  readonly chat?: Hono;
  /** The sign-in a hospital's redirect to `/callback` finishes, as `{ pod, connection }`; none when none waits. */
  back(url: URL): { pod: string; connection: number } | undefined;
  /** The demo people the hospitals hold, as `demoPeople` gives them, at `/demo-people.json`; none when not given. */
  people?(): readonly object[];
  /** The built app's folder, or in development what serves its pages. */
  readonly pages: string | MiddlewareHandler<{ Bindings: HttpBindings }>;
}

const ADDRESS = addresses();

/** Where `/world-date?back=` goes: `back` when it is a path of this app, with the world's date's form open; else home. */
export function worldDateBack(back: string | undefined): string {
  if (back === undefined || !back.startsWith("/") || back.startsWith("//"))
    return ADDRESS.home;
  if (/[\\\s]/.test(back)) return ADDRESS.home;
  const url = new URL(back, "http://app.invalid");
  return url.origin === "http://app.invalid" && !url.pathname.startsWith("//")
    ? `${url.pathname}${url.search}#world-date`
    : ADDRESS.home;
}
/** What the server answers itself, served or not, and never as the app's page. */
const SERVED = /^\/(?:api\/|tools(?:\/|$)|chat$)/;

/**
 * An address a person opens rather than a file a page reads. An id may hold a dot, so a last part with one is a page
 * only when the request is a navigation or asks for HTML.
 */
const isPage = (path: string, headers: Headers) =>
  !SERVED.test(path) &&
  (!/\.[^/]*$/.test(path) ||
    headers.get("sec-fetch-mode") === "navigate" ||
    (headers.get("accept") ?? "").includes("text/html"));

/** `app` serving the built app in `folder`: its files as they are, and its `index.html` for any page a person opens. */
export function withPages<T extends Hono<{ Bindings: HttpBindings }>>(
  app: T,
  folder: string,
): T {
  let page: Promise<string> | undefined;
  app.get("*", serveStatic({ root: folder }), async (c, next) => {
    if (!isPage(c.req.path, c.req.raw.headers)) return next();
    page ??= readFile(join(folder, "index.html"), "utf8");
    return c.html(await page);
  });
  return app;
}

const notWaiting = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not waiting · Cascade</title></head><body><h1>No sign-in is waiting for this</h1></body></html>`;

/** What the chat add-on's `server/chat.ts` gives the server: its routes over `api`, with the model the app was set up with. */
export type ChatServed = (api: Operations) => Hono;

export function appServer(served: Served) {
  const app = new Hono<{ Bindings: HttpBindings }>()
    .use(guard(served.own))
    .route("/", apiRoutes(served.api))
    .route("/", toolRoutes(served.api))
    .route("/", served.chat ?? new Hono())
    .get("/callback", (c) => {
      const at = served.back(new URL(c.req.url));
      return at === undefined
        ? c.html(notWaiting, 400)
        : c.redirect(ADDRESS.connection(at.pod, at.connection), 303);
    })
    .get("/world-date", (c) => c.redirect(worldDateBack(c.req.query("back"))))
    .get("/demo-people.json", (c) => c.json(served.people?.() ?? []));
  const { pages } = served;
  if (typeof pages !== "string") app.get("*", pages);
  else withPages(app, pages);
  app.notFound((c) =>
    c.req.path.startsWith("/api/")
      ? c.json({ refused: "no such operation" }, 404)
      : c.text("Not found", 404),
  );
  return app;
}
