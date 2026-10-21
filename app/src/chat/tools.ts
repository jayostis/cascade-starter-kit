// The tools the chat's model calls that the page runs itself: `PAGE_TOOLS` over the host's PodApi. A navigation moves
// the app in place; a write waits on the person's Allow, then the screen is drawn again.
import { useCallback, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { PAGE_TOOLS, type PageDoor, type ToolInput } from "../../said.ts";
import { useActions } from "../actions.tsx";
import { goState, routed, useAddress } from "../address.tsx";
import { isRefusal, useHost } from "../api.tsx";
import { useConfirm } from "../confirm.tsx";
import { busy, ready } from "../doing.ts";

/** What the person is asked to allow, for each write. */
const ACTIONS: Readonly<Record<string, string>> = {
  make_pod: "Make a pod",
  check_tables: "Check the reference tables for newer versions",
  set_world_date: "Set the date the demo hospitals answer as of",
};

/** What the model is told when the person cancels a write. */
export const SAID_NO = "The person said no";

/** A tool's answer to the model: its output, or why it gave none. */
export type Answer =
  { readonly output: unknown } | { readonly errorText: string };

/**
 * Runs a tool the page runs, by name, with the model's input; `opened(address)` is told before a navigation moves the
 * app. Undefined for a tool the server runs.
 */
export function usePageTools(opened: (address: string) => void) {
  const { api } = useHost();
  const { refreshPods, heldNow } = useActions();
  const confirm = useConfirm();
  const address = useAddress();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const latest = useRef({ navigate, here: pathname + search, opened });
  useLayoutEffect(() => {
    latest.current = { navigate, here: pathname + search, opened };
  });
  return useCallback(
    async (name: string, input: ToolInput): Promise<Answer | undefined> => {
      const tool = PAGE_TOOLS.find((each) => each.name === name);
      if (tool === undefined) return undefined;
      const door: PageDoor = {
        address,
        async open(to) {
          const { navigate, here, opened } = latest.current;
          opened(to);
          const routedTo = routed(new URL(to, location.href));
          if (routedTo === here) return;
          busy("Opening…");
          void navigate(routedTo);
        },
      };
      try {
        if (tool.tier === "free")
          return { output: await tool.run(api, input, door) };
        if (!(await confirm({ action: ACTIONS[name] ?? name, input })))
          return { errorText: SAID_NO };
        busy("Working…");
        try {
          const output = await tool.run(api, input, door);
          if (name === "make_pod") await refreshPods();
          if (name === "check_tables")
            heldNow((output as { held: Parameters<typeof heldNow>[0] }).held);
          const { navigate, here } = latest.current;
          void navigate(here, { state: goState(), replace: true });
          return { output };
        } catch (error) {
          ready();
          throw error;
        }
      } catch (error) {
        if (isRefusal(error)) return { errorText: error.message };
        console.error(error);
        return {
          errorText: `the page failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
    [api, address, confirm, refreshPods, heldNow],
  );
}
