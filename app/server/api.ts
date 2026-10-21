// PodApi over HTTP: `POST /api/<operation>` with a JSON body, checked against its schema in `inputs.ts` before PodApi
// runs, answering JSON. The app's typed client (`hc<ApiRoutes>`, `src/hosts/http.ts`) is made from these routes.
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import type { PodApi } from "../pod-api.ts";
import { INPUTS, type Operation, refusalOf } from "./inputs.ts";

/** What the server answers when it does not answer an operation's output: why it refused, or that it failed. */
export type Output = Record<string, unknown>;

/** The operations the routes call: PodApi, as `podApi(host)` gives it. */
export type Operations = Omit<PodApi, "close">;

const MAX_BODY_BYTES = 1024 * 1024;
const FAILED = "the server failed; its log says why";

/** An error PodApi throws for an input the rules refuse, by name, as the runtime's `Refusal` and `Unopened` carry it. */
interface Refused {
  readonly name: string;
  readonly message: string;
  readonly outcome?: string;
}

const refused = (error: unknown): error is Refused =>
  error instanceof Error &&
  (error.name === "Refusal" || error.name === "Unopened");

const checked = <K extends Operation>(operation: K) =>
  zValidator("json", INPUTS[operation], (result, c) =>
    result.success
      ? undefined
      : c.json({ refused: refusalOf(result.error) }, 400),
  );

/**
 * The routes over `api`: 200 with the output; 400 `{ refused }` for an input its schema refuses, a `Refusal`, a body
 * that is no JSON or over 1 MiB; 423 `{ unopened, refused }` for an `Unopened` (an error with `outcome`); and 500 with
 * a fixed sentence for anything else, the error going to the log.
 */
export function apiRoutes(api: Operations) {
  return new Hono()
    .use(
      "/api/*",
      bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: (c) =>
          c.json(
            { refused: `the body must be at most ${MAX_BODY_BYTES} bytes` },
            400,
          ),
      }),
    )
    .post("/api/pods", checked("pods"), async (c) =>
      c.json(await api.pods(c.req.valid("json"))),
    )
    .post("/api/held", checked("held"), async (c) =>
      c.json(await api.held(c.req.valid("json"))),
    )
    .post("/api/pod", checked("pod"), async (c) =>
      c.json(await api.pod(c.req.valid("json"))),
    )
    .post("/api/answers", checked("answers"), async (c) =>
      c.json(await api.answers(c.req.valid("json"))),
    )
    .post("/api/said", checked("said"), async (c) =>
      c.json(await api.said(c.req.valid("json"))),
    )
    .post("/api/trend", checked("trend"), async (c) =>
      c.json(await api.trend(c.req.valid("json"))),
    )
    .post("/api/classes", checked("classes"), async (c) =>
      c.json(await api.classes(c.req.valid("json"))),
    )
    .post("/api/panel", checked("panel"), async (c) =>
      c.json(await api.panel(c.req.valid("json"))),
    )
    .post("/api/table", checked("table"), async (c) =>
      c.json(await api.table(c.req.valid("json"))),
    )
    .post("/api/ask", checked("ask"), async (c) =>
      c.json(await api.ask(c.req.valid("json"))),
    )
    .post("/api/tool", checked("tool"), async (c) =>
      c.json(await api.tool(c.req.valid("json"))),
    )
    .post("/api/makePod", checked("makePod"), async (c) =>
      c.json(await api.makePod(c.req.valid("json"))),
    )
    .post("/api/waitingWords", checked("waitingWords"), async (c) =>
      c.json(await api.waitingWords(c.req.valid("json"))),
    )
    .post("/api/confirmWords", checked("confirmWords"), async (c) =>
      c.json(await api.confirmWords(c.req.valid("json"))),
    )
    .post("/api/unlock", checked("unlock"), async (c) =>
      c.json(await api.unlock(c.req.valid("json"))),
    )
    .post("/api/deleteAll", checked("deleteAll"), async (c) =>
      c.json(await api.deleteAll(c.req.valid("json"))),
    )
    .post("/api/resetAll", checked("resetAll"), async (c) =>
      c.json(await api.resetAll(c.req.valid("json"))),
    )
    .post("/api/checkTables", checked("checkTables"), async (c) =>
      c.json(await api.checkTables(c.req.valid("json"))),
    )
    .post("/api/setWorldDate", checked("setWorldDate"), async (c) =>
      c.json(await api.setWorldDate(c.req.valid("json"))),
    )
    .post("/api/hospitals", checked("hospitals"), async (c) =>
      c.json(await api.hospitals(c.req.valid("json"))),
    )
    .post("/api/connect", checked("connect"), async (c) =>
      c.json(await api.connect(c.req.valid("json"))),
    )
    .post("/api/connection", checked("connection"), async (c) =>
      c.json(await api.connection(c.req.valid("json"))),
    )
    .post("/api/bring", checked("bring"), async (c) =>
      c.json(await api.bring(c.req.valid("json"))),
    )
    .notFound((c) => c.json({ refused: "no such operation" }, 404))
    .onError((error, c) => {
      if (error instanceof HTTPException && error.status === 400)
        return c.json({ refused: "the body must be JSON" }, 400);
      if (refused(error)) {
        const { outcome } = error as Refused;
        return outcome === undefined
          ? c.json({ refused: error.message }, 400)
          : c.json({ unopened: outcome, refused: error.message }, 423);
      }
      console.error(`${c.req.path} failed:`, error);
      return c.json({ error: FAILED }, 500);
    });
}

export type ApiRoutes = ReturnType<typeof apiRoutes>;
