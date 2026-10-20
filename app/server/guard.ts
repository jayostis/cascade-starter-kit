// What every request must pass before the server answers it: the host it names (its `Host`, which the request's URL
// is made from) must be this server's own address, a page of another name rebinding to it names its own; only GET and POST are answered; and a POST must come from this
// server's own pages, by its `Origin`. `/api/` is answered in JSON, and must be sent JSON.
import type { MiddlewareHandler } from "hono";

/** The addresses this server answers as: its `Host` names and the origins of its own pages. */
export interface Own {
  readonly hosts: ReadonlySet<string>;
  readonly origins: ReadonlySet<string>;
}

const refusedPage = (heading: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${heading} · Cascade</title></head><body><h1>${heading}</h1></body></html>`;

export function guard(own: () => Own): MiddlewareHandler {
  return async (c, next) => {
    const api = c.req.path.startsWith("/api/");
    const refuse = (
      status: 403 | 405 | 415,
      refused: string,
      heading: string,
    ) =>
      api ? c.json({ refused }, status) : c.html(refusedPage(heading), status);
    const { hosts, origins } = own();
    if (!hosts.has(new URL(c.req.url).host))
      return refuse(
        403,
        "not this server's address",
        "Refused: not this server's address",
      );
    const post = c.req.method === "POST";
    if (!post && c.req.method !== "GET")
      return refuse(405, "not allowed", "Not allowed");
    if (post && !origins.has(c.req.header("origin") ?? ""))
      return refuse(
        403,
        "a request from another site",
        "Refused: a form from another site",
      );
    if (
      api &&
      post &&
      !/^application\/json\s*(;|$)/i.test(c.req.header("content-type") ?? "")
    )
      return refuse(415, "send application/json", "Send JSON");
    await next();
  };
}
