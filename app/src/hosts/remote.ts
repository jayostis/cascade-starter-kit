// PodApi called at a server's `/api/`, through Hono's client typed by the server's routes; only their types come from
// the server. What the server refuses is thrown as PodApi throws it in-process, by name.
import { hc, type ClientRequestOptions } from "hono/client";
import type { z } from "zod";
import type { ApiRoutes, Output } from "../../server/api.ts";
import type { INPUTS, Operation } from "../../server/inputs.ts";

/** Only the fields a schema names: its `looseObject` lets the server take others, but a caller may not send them. */
type Named<T> = { [P in keyof T as string extends P ? never : P]: T[P] };

/** What `operation` may be sent, as its route's schema says. */
type In<K extends Operation> = Named<z.input<(typeof INPUTS)[K]>>;

/** PodApi's own errors, by the names the runtime's carry: the screens tell them apart by `name`. */
class Refusal extends Error {
  override name = "Refusal";
}
class Unopened extends Error {
  override name = "Unopened";
  readonly outcome: string;
  constructor(outcome: string, message: string) {
    super(message);
    this.outcome = outcome;
  }
}

/** What the server answered `operation`, or what it refused: 400 a `Refusal`, 423 an `Unopened`, else an `Error`. */
async function answer(
  operation: Operation,
  sent: Promise<Response>,
): Promise<Output> {
  const response = await sent;
  const parsed: unknown = await response.json().catch(() => undefined);
  if (response.ok) {
    if (parsed === undefined)
      throw new Error(
        `${operation}: the server answered ${response.status} with ${response.headers.get("content-type") ?? "no content type"}, not JSON`,
      );
    return parsed as Output;
  }
  const body = (parsed ?? {}) as Output;
  if (typeof body.refused === "string") {
    if (response.status === 423)
      throw new Unopened(String(body.unopened), body.refused);
    if (response.status === 400) throw new Refusal(body.refused);
  }
  throw new Error(`${operation}: the server answered ${response.status}`);
}

/** Every operation of PodApi at the server whose app is at `base`. */
export function remoteApi(base: string, options?: ClientRequestOptions) {
  const { api } = hc<ApiRoutes>(base, options);
  return {
    pods: (json: In<"pods"> = {}) => answer("pods", api.pods.$post({ json })),
    held: (json: In<"held"> = {}) => answer("held", api.held.$post({ json })),
    pod: (json: In<"pod">) => answer("pod", api.pod.$post({ json })),
    answers: (json: In<"answers">) =>
      answer("answers", api.answers.$post({ json })),
    said: (json: In<"said">) => answer("said", api.said.$post({ json })),
    trend: (json: In<"trend">) => answer("trend", api.trend.$post({ json })),
    classes: (json: In<"classes">) =>
      answer("classes", api.classes.$post({ json })),
    panel: (json: In<"panel">) => answer("panel", api.panel.$post({ json })),
    table: (json: In<"table"> = {}) =>
      answer("table", api.table.$post({ json })),
    ask: (json: In<"ask">) => answer("ask", api.ask.$post({ json })),
    tool: (json: In<"tool">) => answer("tool", api.tool.$post({ json })),
    makePod: (json: In<"makePod">) =>
      answer("makePod", api.makePod.$post({ json })),
    waitingWords: (json: In<"waitingWords">) =>
      answer("waitingWords", api.waitingWords.$post({ json })),
    confirmWords: (json: In<"confirmWords">) =>
      answer("confirmWords", api.confirmWords.$post({ json })),
    unlock: (json: In<"unlock">) =>
      answer("unlock", api.unlock.$post({ json })),
    deleteAll: (json: In<"deleteAll"> = {}) =>
      answer("deleteAll", api.deleteAll.$post({ json })),
    resetAll: (json: In<"resetAll"> = {}) =>
      answer("resetAll", api.resetAll.$post({ json })),
    checkTables: (json: In<"checkTables"> = {}) =>
      answer("checkTables", api.checkTables.$post({ json })),
    setWorldDate: (json: In<"setWorldDate">) =>
      answer("setWorldDate", api.setWorldDate.$post({ json })),
    hospitals: (json: In<"hospitals"> = {}) =>
      answer("hospitals", api.hospitals.$post({ json })),
    connect: (json: In<"connect">) =>
      answer("connect", api.connect.$post({ json })),
    connection: (json: In<"connection">) =>
      answer("connection", api.connection.$post({ json })),
    bring: (json: In<"bring">) => answer("bring", api.bring.$post({ json })),
    close: async () => undefined,
  };
}
