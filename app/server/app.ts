// The Node target's server: the guard, PodApi at `/api/`, the chat at `/chat`, a hospital's redirect back at
// `/callback`, and the built app: its files as they are, and its page for any other address a person opens.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { Hono, type MiddlewareHandler } from "hono";
import { addresses } from "../addresses.ts";
import { apiRoutes, type Operations } from "./api.ts";
import { guard, type Own } from "./guard.ts";

export interface Served {
  readonly api: Operations;
  /** This server's own addresses, known once it listens. */
  own(): Own;
  /** Answers `POST /chat` on the request itself. */
  chat(request: IncomingMessage, response: ServerResponse): Promise<void>;
  /** The sign-in a hospital's redirect to `/callback` finishes, as `{ pod, connection }`; none when none waits. */
  back(url: URL): { pod: string; connection: number } | undefined;
  /** The built app's folder, or in development what serves its pages. */
  readonly pages: string | MiddlewareHandler<{ Bindings: HttpBindings }>;
}

const ADDRESS = addresses();
/**
 * An address a person opens rather than a file a page reads. An id may hold a dot, so a last part with one is a page
 * only when the request is a navigation or asks for HTML.
 */
const isPage = (path: string, headers: Headers) =>
  !path.startsWith("/api/") &&
  (!/\.[^/]*$/.test(path) ||
    headers.get("sec-fetch-mode") === "navigate" ||
    (headers.get("accept") ?? "").includes("text/html"));

const notWaiting = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not waiting · Cascade</title></head><body><h1>No sign-in is waiting for this</h1></body></html>`;

export function appServer(served: Served) {
  const app = new Hono<{ Bindings: HttpBindings }>()
    .use(guard(served.own))
    .route("/", apiRoutes(served.api))
    .post("/chat", async (c) => {
      await served.chat(c.env.incoming, c.env.outgoing);
      return RESPONSE_ALREADY_SENT;
    })
    .get("/callback", (c) => {
      const at = served.back(new URL(c.req.url));
      return at === undefined
        ? c.html(notWaiting, 400)
        : c.redirect(
            `${ADDRESS.pod(at.pod)}?connection=${at.connection}#connection`,
            303,
          );
    });
  const { pages } = served;
  if (typeof pages !== "string") app.get("*", pages);
  else {
    let page: Promise<string> | undefined;
    app.get("*", serveStatic({ root: pages }), async (c, next) => {
      if (!isPage(c.req.path, c.req.raw.headers)) return next();
      page ??= readFile(join(pages, "index.html"), "utf8");
      return c.html(await page);
    });
  }
  app.notFound((c) =>
    c.req.path.startsWith("/api/")
      ? c.json({ refused: "no such operation" }, 404)
      : c.text("Not found", 404),
  );
  return app;
}
