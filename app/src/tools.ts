// The tools a model reaches the app by through the page's model context (WebMCP), on every screen, where the browser
// has one: the reads of the one list (`tools.ts`) as the host runs them, and the tools the page runs itself
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
import { isRefusal, useHost, type ReadTool } from "./api.tsx";
import { checkToolInput, type Input, type Schema } from "./check.ts";
import { ACTIONS, SAID_NO, useConfirm, type Confirm } from "./confirm.tsx";
import { settled } from "./doing.ts";

/** The tool WebMCP's `registerTool` takes: it goes when its `signal` aborts. */
interface ModelTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Schema;
  execute(input: Input, options?: { signal?: AbortSignal }): Promise<unknown>;
}

interface ModelContext {
  registerTool(tool: ModelTool, options: { signal: AbortSignal }): unknown;
}

const modelContext = () =>
  (document as unknown as { modelContext?: ModelContext }).modelContext;

/**
 * What the agent reads when a call is refused: WebMCP only logs a rejected `execute` and tells the agent an opaque
 * `OperationError`, so a refusal resolves, and only a broken runtime rejects.
 */
async function answering(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (error) {
    if (isRefusal(error)) return { refused: error.message };
    throw error;
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

/** The pod last read as open: a locked pod is offered as no pod shown; `checked` is the pod that read was of. */
function useOpened(pod: string | undefined) {
  const { api } = useHost();
  const { pathname } = useLocation();
  const [read, setRead] = useState<{
    readonly checked: string | undefined;
    readonly opened: string | undefined;
  }>({ checked: undefined, opened: undefined });
  useEffect(() => {
    if (pod === undefined) return;
    let live = true;
    api.pod({ pod }).then(
      ({ locked }) =>
        live &&
        setRead({
          checked: pod,
          opened: locked === undefined ? pod : undefined,
        }),
      () => live && setRead({ checked: pod, opened: undefined }),
    );
    return () => {
      live = false;
    };
  }, [api, pod, pathname]);
  return read;
}

/** What a tool's run reads at the time of the call, not of the commit that offered it. */
interface Now {
  readonly act: Actions["act"];
  readonly confirm: Confirm;
  readonly refreshPods: Actions["refreshPods"];
  readonly heldNow: Actions["heldNow"];
  readonly here: string;
  /** Whether the tools offered are those of the screen shown: its pod, if any, has been read. */
  readonly offered: boolean;
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
  const { opened, checked } = useOpened(screen.pod);
  const offered = screen.pod === undefined || checked === screen.pod;
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
    offered,
  });
  const arriving = useRef<(() => void)[]>([]);
  useLayoutEffect(() => {
    now.current = {
      act,
      confirm,
      refreshPods,
      heldNow,
      here: pathname + search,
      offered,
    };
    if (offered) for (const resolve of arriving.current.splice(0)) resolve();
  });
  useLayoutEffect(() => {
    const context = modelContext();
    if (context === undefined || listed === undefined) return;
    const controller = new AbortController();
    const { signal } = controller;

    /** Runs a tool the page runs itself: a move in place through a step, a write once the person has said yes. */
    async function runPage(
      tool: PageTool,
      input: ToolInput,
      called: AbortSignal | undefined,
    ) {
      const writes = tool.tier === "ask";
      if (
        writes &&
        !(await now.current.confirm(
          { action: ACTIONS[tool.name] ?? tool.name, input },
          called,
        ))
      )
        throw refusal(
          called?.aborted === true ? "The ask was withdrawn" : SAID_NO,
        );
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
      if (tool.opens === true) {
        await settled();
        if (!now.current.offered)
          await new Promise<void>((resolve) => arriving.current.push(resolve));
      }
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
          execute: (input) =>
            answering(async () => {
              checkToolInput(schema, input);
              return reads.run(read.name, filled ? { ...input, pod } : input);
            }),
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
          execute: (input, options) =>
            answering(async () => {
              checkToolInput(schema, input);
              return runPage(
                tool,
                tool.ofPod === true && !takes
                  ? { ...(input as ToolInput), pod }
                  : (input as ToolInput),
                options?.signal,
              );
            }),
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
