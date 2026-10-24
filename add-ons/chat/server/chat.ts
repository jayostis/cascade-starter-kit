// `/chat`: a person's question goes to the model the app was set up with (`models.ts`) through the AI SDK. The server
// runs the free reads of `tools.ts` for up to `MAX_ROUNDS` rounds; every other tool it offers goes to the page with
// no server `execute`, so the page moves itself and asks the person before a write. `POST /chat` answers with the
// AI SDK's UI message stream; `GET /chat` names the model.
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  InvalidToolInputError,
  isStepCount,
  type JSONSchema7,
  jsonSchema,
  type JSONValue,
  NoSuchToolError,
  streamText,
  tool,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
  validateUIMessages,
} from "ai";
import { checkInput, type InputSchema, Refusal } from "cascade-runtime";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { addresses } from "../addresses.ts";
import { type Model, modelFrom } from "../models.ts";
import { maps } from "../pod-api.ts";
import { podPath, trendPath } from "../pods.ts";
import { CHANGED, changeSaid, entryId } from "../said.ts";
import { TOOLS, withPod } from "../tools.ts";
import type { ChatServed } from "./app.ts";

/** How many rounds of tool calls a chat runs before the model must answer. */
export const MAX_ROUNDS = 6;
const MAX_MESSAGES = 100;
const MAX_CHARACTERS = 100_000;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_CONTEXT = 200;

/** The rules the model is given, apart from where the person is. */
export const RULES = `You answer questions about the health records in the pods of this app, for the person who owns them.
Every number, date and name you give comes from a tool's result, never from memory or estimate. Say when a tool finds nothing.
A finding says what changed after what: a test's results were lower or higher after a medication started or stopped. It never says why, never that the medication caused the change, and never advice about what to do. A clinician can say why.
A record's date is a fact of the record. Never call a date "in the future" or "in the past" because of what you believe the date today to be.
Write plain text with no links and no markdown. The app shows a finding's rows under your answer, and open_trend, open_entry and open_pod move the app to a page: use them when the person asks to see something.`;

/** What a chat that began with "Ask about this" is also told: its answer is about the thing, not the person. */
export const EXPLAIN_THE_THING =
  "Explain the thing the person asked about, never the person: say what the records show of it, and nothing of the person's habits, choices or character.";

const NO_MODEL = "No model is set. Run `npm run model`.";
const FAILED = "the chat failed; the server's log says why";
const TOOL_FAILED = "the server failed; its log says why";
const REFUSED = "The model declined to answer.";
const ROUNDS = `the model was still asking for tools after ${MAX_ROUNDS} rounds`;

/** PodApi's operations as the tools call them: each takes its input and resolves its output. */
export type PodApi = Record<string, (input: never) => Promise<unknown>>;

interface Finding {
  key: string;
  kind: string;
  direction: string;
  rows: Record<
    "before" | "after",
    { entry?: string; performed: string; value: string; unit?: string }[]
  >;
}

const isRefusal = (error: unknown): error is Error =>
  error instanceof Error && error.name === "Refusal";

/** What the page says of a finding (`changeSaid`), named by `about`; nothing where there were not enough results. */
function saidOf(finding: Finding, about: Map<string, unknown>) {
  return CHANGED[finding.direction] === undefined
    ? undefined
    : changeSaid(finding as never, about as never);
}

/** A finding's rows as a card shows them: each lab result by its entry's ID. */
const rowsOf = ({ rows }: Finding) =>
  (["before", "after"] as const).flatMap((side) =>
    rows[side].map((row) => ({
      entry: entryId(row.entry ?? ""),
      performed: row.performed,
      value: row.value,
      unit: row.unit,
      side,
    })),
  );

/** The addresses of the app's own pages, which `find_changes` names a finding's view by. */
const ADDRESS = { pod: podPath, trend: trendPath, entry: addresses().entry };

type Input = Record<string, unknown> & { pod: string };

/** A tool of `tools.ts`, as this route reads it. */
interface Listed {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: InputSchema;
  readonly tier: string;
  readonly ofPod?: boolean;
  readonly opens?: boolean;
  run(api: PodApi, input: Input, door: object): Promise<unknown>;
  findings?(
    api: PodApi,
    input: Input,
    door: object,
  ): Promise<{ value: { key: string }[]; found: Finding[] }>;
}

const LISTED = TOOLS as unknown as readonly Listed[];

/** `schema` as the AI SDK takes it, its input checked as the runtime checks a tool's. */
function checked(schema: InputSchema) {
  return jsonSchema<Input>(schema as JSONSchema7, {
    validate(value) {
      try {
        checkInput(schema, value);
        return { success: true, value: value as Input };
      } catch (error) {
        if (!isRefusal(error)) throw error;
        return { success: false, error };
      }
    },
  });
}

const opened = z.object({ opened: z.string() });

/**
 * What the page answers each tool it runs with, which is what `run` in `tools.ts` gives: `validateUIMessages` holds
 * a client's answer to the model to these before the model sees it.
 */
export const CLIENT_OUTPUTS = {
  open_pod: opened,
  open_trend: opened,
  open_entry: opened,
  open_classes: opened,
  open_panel: opened,
  open_table: opened,
  make_pod: z.object({
    pod: z.string(),
    made: z.boolean().optional(),
    loaded: z.boolean().optional(),
    waiting: z.boolean().optional(),
  }),
  check_tables: z.object({
    checked: z.array(z.unknown()),
    held: z.array(z.unknown()),
  }),
  set_world_date: z.object({ asOf: z.string().optional() }),
};

/** Runs a tool: a `Refusal` goes to the model as it is, any other error to the log and a fixed sentence. */
async function running<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isRefusal(error)) throw error;
    console.error(error);
    throw new Error(TOOL_FAILED, { cause: error });
  }
}

/**
 * Every tool of the one list, for the AI SDK. The free reads run here over `api`; `find_changes` gives the page each
 * finding with its rows and the app's sentence, and the model the compact finding. The navigation and ask tools have
 * no `execute`: the model's call to one ends the server's turn and goes to the page.
 */
export function chatTools(api: PodApi): ToolSet {
  return Object.fromEntries(
    LISTED.map((each) => {
      const schema = each.ofPod ? withPod(each.inputSchema) : each.inputSchema;
      const offered = {
        description: each.description,
        inputSchema: checked(schema),
      };
      if (each.tier !== "free" || each.opens)
        return [
          each.name,
          tool({
            ...offered,
            outputSchema: CLIENT_OUTPUTS[
              each.name as keyof typeof CLIENT_OUTPUTS
            ] as z.ZodType<object>,
          }),
        ];
      const { findings } = each;
      if (findings !== undefined)
        return [
          each.name,
          tool({
            ...offered,
            execute: (input) =>
              running(async () => {
                const [{ value, found }, said] = await Promise.all([
                  findings(api, input, { address: ADDRESS }),
                  api.said({ pod: input.pod } as never),
                ]);
                const { about } = maps(said as never) as {
                  about: Map<string, unknown>;
                };
                return value.map((finding) => {
                  const whole = found.find(({ key }) => key === finding.key)!;
                  return {
                    ...finding,
                    said: saidOf(whole, about),
                    rows: rowsOf(whole),
                  };
                });
              }),
            toModelOutput: ({ output }) => ({
              type: "json",
              value: output.map(
                ({ said: _said, rows: _rows, ...compact }) => compact,
              ) as JSONValue,
            }),
          }),
        ];
      return [
        each.name,
        tool({
          ...offered,
          execute: (input) =>
            running(async () => each.run(api, input, { address: ADDRESS })),
        }),
      ];
    }),
  );
}

const POD_RULE = "pod must be a pod's name, or an empty string for none";
const PAGE_RULE = "page must be an address on this app, starting with /";
const MESSAGES_RULE = "messages must be a list with at least one message";
const CONTEXT_RULE = `context must be { kind: "finding", key }, { kind: "entry", id }, { kind: "trend", test, medication? } or { kind: "worth", entry }, each value a text of at most ${MAX_CONTEXT} characters`;

const said = z.string().min(1).max(MAX_CONTEXT);
const CONTEXT = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("finding"), key: said }),
  z.strictObject({ kind: z.literal("entry"), id: said }),
  z.strictObject({
    kind: z.literal("trend"),
    test: said,
    medication: said.optional(),
  }),
  z.strictObject({ kind: z.literal("worth"), entry: said }),
]);

/** A message as the AI SDK's chat sends it: the person's in text, the model's as the stream made it. */
const MESSAGE = z
  .looseObject({
    id: z.string(),
    role: z.enum(["user", "assistant"]),
    parts: z.array(z.looseObject({ type: z.string() })).min(1),
  })
  .refine(
    ({ role, parts }) =>
      role === "assistant" ||
      parts.every(
        (part) =>
          part.type === "text" &&
          typeof part.text === "string" &&
          part.text !== "",
      ),
  );

/** How much a message weighs against `MAX_CHARACTERS`: a text part its text, any other part (a tool's output, its error) its JSON. */
const sizeOf = ({ parts }: z.output<typeof MESSAGE>) =>
  parts.reduce(
    (sum, part) =>
      sum +
      (part.type === "text" && typeof part.text === "string"
        ? part.text.length
        : JSON.stringify(part).length),
    0,
  );

/** A tool part of the model's whose answer the page has given. */
const answered = (part: { type: string; state?: unknown }) =>
  part.type.startsWith("tool-") &&
  ["output-available", "output-error", "output-denied"].includes(
    String(part.state),
  );

/**
 * The body of `POST /chat`: `pod` (the name of the pod the page is about, or "" for none), `page` (its address),
 * `messages` (the chat as the AI SDK's `useChat` keeps it), optionally `context` (what an "Ask about this" is about),
 * and the `id`, `trigger` and `messageId` the SDK's transport adds.
 */
const BODY = z
  .strictObject({
    pod: z.string({ error: POD_RULE }).max(200, { error: POD_RULE }),
    page: z
      .string({ error: PAGE_RULE })
      .startsWith("/", { error: PAGE_RULE })
      .max(2000, { error: PAGE_RULE }),
    messages: z
      .array(MESSAGE, { error: MESSAGES_RULE })
      .min(1, { error: MESSAGES_RULE })
      .max(MAX_MESSAGES, {
        error: `messages must be at most ${MAX_MESSAGES} messages`,
      }),
    context: CONTEXT.optional(),
    id: z.string().optional(),
    trigger: z.string().optional(),
    messageId: z.string().optional(),
  })
  .superRefine(({ messages }, context) => {
    if (
      messages.reduce((sum, message) => sum + sizeOf(message), 0) >
      MAX_CHARACTERS
    )
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message: `messages must be at most ${MAX_CHARACTERS} characters in all`,
      });
    const last = messages.at(-1);
    if (
      last !== undefined &&
      last.role !== "user" &&
      !(
        last.parts.some(answered) &&
        last.parts.every(
          (part) => !part.type.startsWith("tool-") || answered(part),
        )
      )
    )
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message:
          "the last message must be the person's, or the model's with the page's answers to its tools",
      });
  });

/** Why `BODY` refused a body, in the words of the rule it broke. */
function refusalOf(error: z.ZodError) {
  const [issue] = error.issues;
  const [field, at] = issue!.path;
  if (field === undefined)
    return issue!.code === "unrecognized_keys"
      ? `${issue!.keys[0]} is not a property of the body`
      : "the body must be a JSON object";
  if (field === "context") return CONTEXT_RULE;
  if (field === "messages" && typeof at === "number")
    return `messages[${at}] must be a user message with text, or an assistant message as the chat's stream made it`;
  return issue!.message;
}

/** The body, checked; its messages are checked against the tools' schemas too. */
async function bodyOf(given: unknown, tools: ToolSet) {
  const parsed = BODY.safeParse(given);
  if (!parsed.success) throw new Refusal(refusalOf(parsed.error));
  const { pod, page, context } = parsed.data;
  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({
      messages: parsed.data.messages,
      tools,
    });
  } catch (error) {
    throw new Refusal(
      `messages must be the chat's own: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { pod, page, context, messages };
}

/** The system prompt: the rules, where the person is, and for Ask about this the thing they asked about. */
function instructionsOf({
  pod,
  page,
  context,
}: {
  pod: string;
  page: string;
  context?: unknown;
}) {
  return [
    RULES,
    `${pod === "" ? "No pod is open." : `The person is looking at the pod ${pod}.`} The page on screen is ${page}.`,
    ...(context === undefined
      ? []
      : [
          `The person asked about this: ${JSON.stringify(context)}. It names a finding by its key, an entry by its ID, a trend by its test and medication, or a line of Worth a look by its entry's ID; worth_a_look gives that line, which says what is flagged and never why. Find it with the tools.`,
          EXPLAIN_THE_THING,
        ]),
  ].join("\n\n");
}

/**
 * The chunk an error ends the stream with: a tool's refusal or the SDK's word on a bad call as they are, the model's
 * failure as `model.failure` says it, and anything else a fixed sentence, the error going to the log.
 */
function errorText(model: Model) {
  return (error: unknown) => {
    if (typeof error === "string") return error;
    if (
      isRefusal(error) ||
      NoSuchToolError.isInstance(error) ||
      InvalidToolInputError.isInstance(error) ||
      (error instanceof Error && error.message === TOOL_FAILED)
    )
      return error.message;
    const failed = model.failure(error);
    if (failed !== undefined) return failed;
    console.error(error);
    return FAILED;
  };
}

/**
 * The steps of this question already made: a request that continues a turn (the page answered a tool and sent again)
 * carries every earlier step of it as the `step-start` parts of the trailing assistant message.
 */
const stepsBefore = (messages: UIMessage[]) => {
  const last = messages.at(-1);
  return last?.role === "assistant"
    ? last.parts.filter(({ type }) => type === "step-start").length
    : 0;
};

/** The stream of a question whose rounds are all spent: the error, and no call to the model. */
const spent = () =>
  new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: "start" });
      controller.enqueue({ type: "error", errorText: ROUNDS });
      controller.enqueue({ type: "finish", finishReason: "error" });
      controller.close();
    },
  });

/**
 * The model's turn as the UI message stream, with its end said: a refusal as a `data-refused` part, and a round of tool
 * calls past `MAX_ROUNDS` as an error, each before the stream's `finish`. `earlier` steps of the question were made
 * already; the tool chunks of every step after the `MAX_ROUNDS`th are dropped, so that the page runs no tool past it.
 */
function ending(stream: ReadableStream<UIMessageChunk>, earlier: number) {
  let steps = earlier;
  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (steps >= MAX_ROUNDS && chunk.type.startsWith("tool-")) return;
        if (chunk.type === "finish-step") steps += 1;
        if (chunk.type === "finish") {
          if (chunk.finishReason === "content-filter")
            controller.enqueue({
              type: "data-refused",
              data: { text: REFUSED },
            });
          else if (chunk.finishReason === "tool-calls" && steps > MAX_ROUNDS)
            controller.enqueue({ type: "error", errorText: ROUNDS });
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

/**
 * `GET /chat` and `POST /chat` over `api`, with `model`, or none when none is set. A body the rules refuse is 400
 * `{ error }` with the reason and no model set is 503, before anything is streamed; a request that closes aborts the
 * model's call.
 */
export function chatRoutes({
  api,
  model,
}: {
  api: PodApi;
  model: Model | undefined;
}) {
  const tools = chatTools(api);
  return new Hono()
    .get("/chat", (c) =>
      c.json(
        model === undefined
          ? {}
          : { provider: model.provider, name: model.name, local: model.local },
      ),
    )
    .post(
      "/chat",
      bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: (c) =>
          c.json(
            { error: `the body must be at most ${MAX_BODY_BYTES} bytes` },
            400,
          ),
      }),
      async (c) => {
        if (model === undefined) return c.json({ error: NO_MODEL }, 503);
        let given;
        try {
          given = await c.req.json();
        } catch {
          return c.json({ error: "the body must be JSON" }, 400);
        }
        try {
          const body = await bodyOf(given, tools);
          const names = (await api.pods({} as never)) as {
            pods: { name: string }[];
          };
          if (
            body.pod !== "" &&
            !names.pods.some(({ name }) => name === body.pod)
          )
            throw new Refusal(`there is no pod ${body.pod}`);
          const earlier = stepsBefore(body.messages);
          if (earlier > MAX_ROUNDS)
            return createUIMessageStreamResponse({ stream: spent() });
          const result = streamText({
            model: model.language(),
            instructions: instructionsOf(body),
            messages: await convertToModelMessages(body.messages, { tools }),
            tools,
            stopWhen: isStepCount(MAX_ROUNDS + 1 - earlier),
            maxRetries: 0,
            abortSignal: c.req.raw.signal,
            onError: () => {},
          });
          return createUIMessageStreamResponse({
            stream: ending(
              result.toUIMessageStream({
                originalMessages: body.messages,
                onError: errorText(model),
              }),
              earlier,
            ),
          });
        } catch (error) {
          if (isRefusal(error)) return c.json({ error: error.message }, 400);
          console.error(error);
          return c.json({ error: FAILED }, 500);
        }
      },
    );
}

/** The model the app was set up with (`npm run model`), or none, a setting the client refuses said on the console. */
function modelSet(): Model | undefined {
  try {
    return modelFrom();
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    console.error(`No model is used: ${error.message}`);
    return undefined;
  }
}

/** What `server/main.ts` serves at `/chat` when this file is here: the routes over `api`, with the model set up. */
export const chatServed: ChatServed = (api) =>
  chatRoutes({ api, model: modelSet() });
