// The reads of the one list (`tools.ts`) for a page that carries no runtime: `GET /tools` names them, and
// `POST /tools/<name>` runs one on a JSON input, so the page offers them to the model context as the browser target does.
// The tools that move the app or write are the page's own (`PAGE_TOOLS` of `said.ts`), and are not here.
import type { InputSchema } from "cascade-runtime";
import { checkInput } from "cascade-runtime/check";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { addresses } from "../addresses.ts";
import { podPath, trendPath } from "../pods.ts";
import { PAGE_TOOLS } from "../said.ts";
import { TOOLS, withPod } from "../tools.ts";
import type { Operations } from "./api.ts";

const MAX_BODY_BYTES = 1024 * 1024;
const FAILED = "the server failed; its log says why";

interface Read {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: InputSchema;
  readonly tier: string;
  readonly ofPod?: boolean;
  readonly opens?: boolean;
  run(api: Operations, input: object, door: object): Promise<unknown>;
}

const OWN = new Set(PAGE_TOOLS.map(({ name }) => name));
const READS = (TOOLS as unknown as readonly Read[]).filter(
  ({ name, tier, opens }) => tier === "free" && !opens && !OWN.has(name),
);
const ADDRESS = { pod: podPath, trend: trendPath, entry: addresses().entry };

const isRefusal = (error: unknown): error is Error =>
  error instanceof Error && error.name === "Refusal";

/** The routes over `api`: 200 with the tool's answer; 400 `{ refused }` for input the tool's schema or the rules refuse; 404 for a name that is no read; 500 with a fixed sentence for anything else. */
export function toolRoutes(api: Operations) {
  return new Hono()
    .get("/tools", (c) =>
      c.json(
        READS.map(({ name, description, inputSchema, ofPod }) => ({
          name,
          description,
          inputSchema,
          ofPod: ofPod === true,
        })),
      ),
    )
    .post(
      "/tools/:name",
      bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: (c) =>
          c.json(
            { refused: `the body must be at most ${MAX_BODY_BYTES} bytes` },
            400,
          ),
      }),
      async (c) => {
        const read = READS.find(({ name }) => name === c.req.param("name"));
        if (read === undefined) return c.json({ refused: "no such tool" }, 404);
        try {
          const input: unknown = await c.req.json().catch(() => undefined);
          const schema = read.ofPod
            ? withPod(read.inputSchema)
            : read.inputSchema;
          checkInput(schema as never, input);
          return c.json(
            (await read.run(api, input as object, {
              address: ADDRESS,
            })) as never,
          );
        } catch (error) {
          if (isRefusal(error)) return c.json({ refused: error.message }, 400);
          console.error(error);
          return c.json({ error: FAILED }, 500);
        }
      },
    );
}
