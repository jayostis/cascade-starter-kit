// What the app writes: each step a screen's form posts, run by the route's action over the host's PodApi, which then
// moves the app where the step goes or reads the screen again; and the way a model's tools write and move the app,
// through the router as well.
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  redirect,
  useFetcher,
  useLocation,
  useNavigate,
  type ActionFunctionArgs,
  type Params,
} from "react-router";
import {
  checkedNote,
  didNote,
  PAGE_TOOLS,
  refusal,
  type ToolInput,
} from "../said.ts";
import { ADDRESS, ROUTED, routed } from "./address.tsx";
import type { Host } from "./api.tsx";
import { settled } from "./doing.ts";
import { leaveNote, type Did } from "./screen.tsx";

/** What a step's action says where it stays on its screen: also the six words' or the unlock's own outcome. */
export interface Stayed extends Did {
  /** Why the six words were not taken, while they still wait. */
  readonly problem?: string;
  /** How the pod failed to open, as `Unopened` says. */
  readonly unopened?: string;
}

const isNamed = (error: unknown, name: string): error is Error =>
  error instanceof Error && error.name === name;

/** Offers the words to the browser's password manager, where it has an API for it; never relied on. */
function offerToSave(name: string, words: string): void {
  try {
    const { PasswordCredential } = globalThis as {
      PasswordCredential?: new (init: {
        id: string;
        name: string;
        password: string;
      }) => Credential;
    };
    if (PasswordCredential === undefined) return;
    navigator.credentials
      .store(new PasswordCredential({ id: name, name, password: words }))
      .catch(() => undefined);
  } catch {
    // The offer is a courtesy.
  }
}

let closeSignIn: (() => void) | undefined;

/** Opens the host's sign-in window, where it has one, in the click that asks: a browser opens one only there. */
export function openSignIn(host: Host) {
  closeSignIn = host.openSignIn?.();
}

/** A model's call of a write the page runs, waiting for the step that runs it. */
const calls = new Map<
  string,
  { resolve(output: unknown): void; reject(error: unknown): void }
>();
let called = 0;

type Step = (
  field: (name: string) => string,
  params: Params,
) => Promise<Response | Stayed | null>;

/**
 * The action every route has: the step its form's `intent` names, on its other fields. A step that moves returns the
 * router's redirect, with the note it leaves there; one that stays returns nothing and the screen is read again, or
 * what it has to say. A `Refusal` is the step's "Not done", drawn with its sentence; an `Unopened` pod is read again,
 * which draws its unlock screen.
 */
export function steps(host: Host) {
  const { api } = host;
  const STEPS: Readonly<Record<string, Step>> = {
    async make(field) {
      const made = await api.makePod({
        person: field("person") || field("pod"),
        encrypt: field("encrypt") === "on",
      });
      return redirect(
        made.waiting === true ? ROUTED.words(made.pod) : ROUTED.pod(made.pod),
      );
    },
    async "confirm-words"(field, { pod = "" }) {
      try {
        await api.confirmWords({
          pod,
          word2: field("word2"),
          word5: field("word5"),
          password: field("password"),
          username: field("username"),
        });
      } catch (error) {
        const waits = await api.waitingWords({ pod }).then(
          () => true,
          () => false,
        );
        if (!isNamed(error, "Refusal") || !waits) throw error;
        return { problem: error.message };
      }
      offerToSave(pod, field("password"));
      return redirect(ROUTED.pod(pod));
    },
    async unlock(field, { pod = "" }) {
      try {
        await api.unlock({ pod, secret: field("password") });
      } catch (error) {
        if (!isNamed(error, "Unopened")) throw error;
        return {
          unopened:
            (error as Error & { outcome?: string }).outcome ??
            "incorrect secret",
        };
      }
      return null;
    },
    async "delete-all"() {
      const { deleted } = await api.deleteAll();
      leaveNote(
        ROUTED.home,
        didNote(new URLSearchParams({ deleted: String(deleted.length) }), []),
      );
      return redirect(ROUTED.home);
    },
    async "reset-all"() {
      const { pods } = await api.resetAll();
      const [first] = pods;
      const to = first === undefined ? ROUTED.home : ROUTED.pod(first);
      leaveNote(
        to,
        pods.length === 0
          ? undefined
          : didNote(new URLSearchParams("reset"), pods),
      );
      return redirect(to);
    },
    async "check-tables"() {
      const { checked, held } = await api.checkTables();
      leaveNote(ROUTED.table(), checkedNote(checked, held));
      return redirect(ROUTED.table());
    },
    async "world-date"(field) {
      await api.setWorldDate({ date: field("date") });
      return null;
    },
    async "sign-in"(field, { pod = "" }) {
      const close = closeSignIn;
      closeSignIn = undefined;
      const { connection, authorize } = await api
        .connect({ pod, fhirBase: field("fhirBase") })
        .catch((error: unknown) => {
          close?.();
          throw error;
        });
      if (host.openSignIn !== undefined || authorize === undefined)
        return redirect(ROUTED.connection(pod, connection));
      return { leave: authorize };
    },
    async bring(field, { pod = "" }) {
      await api.bring({ pod, connection: Number(field("connection")) });
      return null;
    },
    async tool(field) {
      const call = calls.get(field("call"));
      calls.delete(field("call"));
      const tool = PAGE_TOOLS.find(({ name }) => name === field("tool"));
      let to: string | undefined;
      try {
        if (tool === undefined) throw refusal(`No tool ${field("tool")}`);
        call?.resolve(
          await tool.run(api, JSON.parse(field("input")) as ToolInput, {
            address: ADDRESS,
            async open(address) {
              to = routed(new URL(address, location.href));
            },
          }),
        );
      } catch (error) {
        call?.reject(error);
      }
      return to === undefined ? null : redirect(to);
    },
  };
  return async ({ request, params }: ActionFunctionArgs) => {
    const fields = await request.formData();
    const field = (name: string) => String(fields.get(name) ?? "");
    const step = STEPS[field("intent")];
    if (step === undefined) throw new Error(`no step ${field("intent")}`);
    try {
      return await step(field, params);
    } catch (error) {
      if (isNamed(error, "Refusal")) return { refused: error.message };
      if (isNamed(error, "Unopened")) return null;
      throw error;
    }
  };
}

/** How a model's tools move the app and write: through the router, each settling once the page has drawn it. */
export interface ToolSteps {
  /** Runs the page's tool `name`, a write, as a step of the screen shown; what it gave, or its refusal thrown. */
  write(name: string, input: ToolInput): Promise<unknown>;
  /** Moves the app to the router path `to`, as a step: settles once the screen there is drawn. */
  move(to: string): Promise<void>;
}

export function useToolSteps(): ToolSteps {
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const latest = useRef({ fetcher, navigate, here: pathname + search });
  useLayoutEffect(() => {
    latest.current = { fetcher, navigate, here: pathname + search };
  });
  return useMemo(
    () => ({
      async write(name, input) {
        const call = String((called += 1));
        const answer = new Promise((resolve, reject) =>
          calls.set(call, { resolve, reject }),
        );
        answer.catch(() => undefined);
        await latest.current.fetcher.submit(
          {
            intent: "tool",
            doing: "Working…",
            tool: name,
            input: JSON.stringify(input),
            call,
          },
          { method: "post", action: latest.current.here },
        );
        if (calls.delete(call))
          throw refusal("The page is busy with something else; try again");
        return answer;
      },
      async move(to) {
        await latest.current.navigate(to, { state: { step: true } });
        await settled();
      },
    }),
    [],
  );
}
