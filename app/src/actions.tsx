// What a screen does beyond reading: a step that writes or moves the app, run with the page busy, and what the shell
// holds that a step changes. A screen asks for them here and never knows how the shell keeps them.
import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { Series } from "../said.ts";
import { failed, ready } from "./doing.ts";

/**
 * Moves the app to the router path `to`, drawing it again even if it is the address shown, with `note` above it. With
 * `stay()`, the app stays where it is, and the screen shown says when it is ready, as one moved to does.
 */
export type Go = ((to: string, note?: string) => void) & { stay(): void };

export interface Actions {
  /**
   * Does `step` with the page busy, saying `doing`; while it is busy, another step does not start. What the rules
   * refuse, the page draws as not done with the sentence; anything else, as gone wrong.
   */
  act(step: (go: Go) => Promise<void>, doing?: string): void;
  /** Reads the pods again for the sidebar; their names. */
  refreshPods(): Promise<readonly string[]>;
  /** Makes the sidebar list the reference tables `held`, which a read of them found. */
  heldNow(held: readonly Series[]): void;
}

const ActionsContext = createContext<Actions | undefined>(undefined);

export const ActionsProvider = ActionsContext.Provider;

export function useActions(): Actions {
  const actions = useContext(ActionsContext);
  if (actions === undefined)
    throw new Error("the app is drawn with no actions");
  return actions;
}

/** A screen of one sentence under a heading, which says the page is ready, or with `wrong` that it went wrong. */
export function Notice({
  heading,
  wrong = false,
  drawn,
  children,
}: {
  heading: string;
  wrong?: boolean;
  /** Changes whenever the screen is drawn again, so that it says so again. */
  drawn?: number;
  children: ReactNode;
}) {
  useEffect(wrong ? failed : ready, [wrong, drawn]);
  return (
    <>
      <h1>{heading}</h1>
      <p>{children}</p>
    </>
  );
}
