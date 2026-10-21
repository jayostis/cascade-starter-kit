// The tools a model reaches the app by through the page's model context (WebMCP), on every screen, where the browser
// has one: the reads of the one list (`tools.mjs`) as the host runs them, and the tools the page runs itself
// (`PAGE_TOOLS` of `said.ts`). A tool that moves the app moves it in place, as a step does; a write waits on the
// person's Allow. They are offered while the screen shown is the one they were offered for, and taken away in the
// commit that draws the next, never after the next paint.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import {
  PAGE_TOOLS,
  refusal,
  type PageDoor,
  type PageTool,
  type ToolInput,
} from "../said.ts";
import { useActions, type Actions } from "./actions.tsx";
import { routed, useAddress } from "./address.tsx";
import { useHost, type ReadTool } from "./api.tsx";
import { ACTIONS, SAID_NO, useConfirm, type Confirm } from "./confirm.tsx";

/** The part of JSON Schema the tools' inputs use. */
interface Schema {
  readonly type?: string;
  readonly description?: string;
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly enum?: readonly unknown[];
  readonly minimum?: number;
  readonly maximum?: number;
}

type Input = Record<string, unknown>;

/** The tool WebMCP's `registerTool` takes: it goes when its `signal` aborts. */
interface ModelTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Schema;
  execute(input: Input): Promise<unknown>;
}

interface ModelContext {
  registerTool(tool: ModelTool, options: { signal: AbortSignal }): unknown;
}

const modelContext = () =>
  (document as unknown as { modelContext?: ModelContext }).modelContext;

/** Refuses, as the runtime's `checkInput` does, an `input` that `schema` does not allow. */
export function checkToolInput(
  schema: Schema,
  input: unknown,
): asserts input is Input {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw refusal("input must be an object");
  const given = input as Input;
  for (const name of schema.required ?? [])
    if (given[name] === undefined) throw refusal(`${name} is required`);
  for (const [name, value] of Object.entries(given)) {
    const property = schema.properties?.[name];
    if (property === undefined) {
      if (schema.additionalProperties === false)
        throw refusal(`${name} is not an input of this tool`);
      continue;
    }
    if (property.type === "string" && typeof value !== "string")
      throw refusal(`${name} must be a string`);
    if (property.type === "integer" && !Number.isInteger(value))
      throw refusal(`${name} must be an integer`);
    if (property.enum !== undefined && !property.enum.includes(value))
      throw refusal(`${name} must be one of ${property.enum.join(", ")}`);
    if (typeof value === "number") {
      if (property.minimum !== undefined && value < property.minimum)
        throw refusal(`${name} must be at least ${property.minimum}`);
      if (property.maximum !== undefined && value > property.maximum)
        throw refusal(`${name} must be at most ${property.maximum}`);
    }
  }
}

/** `schema` with the pod's name beside its own properties, required: a tool of one pod, on a screen that shows none. */
function withPod(schema: Schema): Schema {
  return {
    ...schema,
    properties: {
      pod: {
        type: "string",
        description: "The pod's name, one of those list_pods gives.",
      },
      ...schema.properties,
    },
    required: ["pod", ...(schema.required ?? [])],
  };
}

/** The pod last read as open: a locked pod is offered as no pod shown. */
function useOpened(pod: string | undefined) {
  const { api } = useHost();
  const { pathname } = useLocation();
  const [opened, setOpened] = useState<string>();
  useEffect(() => {
    if (pod === undefined) return;
    let live = true;
    api.pod({ pod }).then(
      ({ locked }) => live && setOpened(locked === undefined ? pod : undefined),
      () => live && setOpened(undefined),
    );
    return () => {
      live = false;
    };
  }, [api, pod, pathname]);
  return opened;
}

/** What a tool's run reads at the time of the call, not of the commit that offered it. */
interface Now {
  readonly act: Actions["act"];
  readonly confirm: Confirm;
  readonly refreshPods: Actions["refreshPods"];
  readonly heldNow: Actions["heldNow"];
  readonly here: string;
}

/**
 * Offers the model context every tool of the one list but the never list's, while the screen shown is `screen`. With a
 * pod shown, the tools of one pod take it as given; on a screen without one they take its name as `pod`. `open_pod`
 * always takes the name: it is how a model reaches another pod.
 */
export function useTools(screen: { readonly pod: string | undefined }) {
  const { api, reads } = useHost();
  const { act, refreshPods, heldNow } = useActions();
  const confirm = useConfirm();
  const address = useAddress();
  const { pathname, search } = useLocation();
  const opened = useOpened(screen.pod);
  const pod =
    screen.pod !== undefined && opened === screen.pod ? screen.pod : undefined;
  const [listed, setListed] = useState<readonly ReadTool[]>();
  useEffect(() => {
    reads.list().then(setListed, () => setListed([]));
  }, [reads]);
  const now = useRef<Now>({
    act,
    confirm,
    refreshPods,
    heldNow,
    here: pathname + search,
  });
  useLayoutEffect(() => {
    now.current = {
      act,
      confirm,
      refreshPods,
      heldNow,
      here: pathname + search,
    };
  });
  useLayoutEffect(() => {
    const context = modelContext();
    if (context === undefined || listed === undefined) return;
    const controller = new AbortController();
    const { signal } = controller;

    /** Runs a tool the page runs itself: a move in place through a step, a write once the person has said yes. */
    async function runPage(tool: PageTool, input: ToolInput) {
      const writes = tool.tier === "ask";
      if (
        writes &&
        !(await now.current.confirm(
          { action: ACTIONS[tool.name] ?? tool.name, input },
          signal,
        ))
      )
        throw refusal(SAID_NO);
      let output: unknown;
      let failure: unknown;
      let ran = false;
      await now.current.act(
        async (go) => {
          ran = true;
          let went = false;
          const door: PageDoor = {
            address,
            async open(to) {
              went = true;
              go(routed(new URL(to, location.href)));
            },
          };
          try {
            output = await tool.run(api, input, door);
            if (tool.name === "make_pod") await now.current.refreshPods();
            if (tool.name === "check_tables")
              now.current.heldNow(
                (output as { held: Parameters<Actions["heldNow"]>[0] }).held,
              );
          } catch (error) {
            failure = error;
          }
          if (!went) go(now.current.here);
        },
        writes ? "Working…" : "Opening…",
      );
      if (!ran)
        throw refusal("The page is busy with something else; try again");
      if (failure !== undefined) throw failure;
      return output;
    }

    const offering: ModelTool[] = [
      ...listed.map((read): ModelTool => {
        const filled = read.ofPod && pod !== undefined;
        const base = read.inputSchema as Schema;
        const schema = read.ofPod && !filled ? withPod(base) : base;
        return {
          name: read.name,
          description: read.description,
          inputSchema: schema,
          async execute(input) {
            checkToolInput(schema, input);
            return reads.run(read.name, filled ? { ...input, pod } : input);
          },
        };
      }),
      ...PAGE_TOOLS.map((tool): ModelTool => {
        const takes =
          tool.ofPod === true &&
          (tool.name === "open_pod" || pod === undefined);
        const base = tool.inputSchema as Schema;
        const schema = takes ? withPod(base) : base;
        return {
          name: tool.name,
          description: tool.description,
          inputSchema: schema,
          async execute(input) {
            checkToolInput(schema, input);
            return runPage(
              tool,
              tool.ofPod === true && !takes
                ? { ...(input as ToolInput), pod }
                : (input as ToolInput),
            );
          },
        };
      }),
    ];
    for (const tool of offering) context.registerTool(tool, { signal });
    return () => controller.abort();
  }, [api, reads, address, listed, pod]);
}

/** Offers the model context its tools for the screen shown; it draws nothing. */
export function WebTools({ pod }: { pod: string | undefined }): null {
  useTools({ pod });
  return null;
}
