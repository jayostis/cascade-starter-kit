// What the page is doing, in `data-state` on the body: `opening` until the first screen is drawn, `busy` while it goes
// to another or acts, `ready` once the screen asked for is drawn, `error` when something went wrong. While it is busy,
// the doing line says what it is doing and every button is off. The suites wait on this attribute, so it is set as the
// page changes, never later.
import { useSyncExternalStore } from "react";

type State = "opening" | "busy" | "ready" | "error";

let saying: string | undefined;
const listeners = new Set<() => void>();
let drawn: () => void = () => undefined;

/** Settles once the first screen is drawn, so that what loads in the background comes after it. */
export const firstReady = new Promise<void>((resolve) => {
  drawn = resolve;
});

function set(state: State, said?: string) {
  document.body.dataset.state = state;
  if (state !== "error") delete document.body.dataset.error;
  for (const button of document.querySelectorAll("button"))
    button.disabled = state === "busy";
  saying = said;
  if (state === "ready") drawn();
  for (const listener of listeners) listener();
}

export const busy = (said = "Working…") => set("busy", said);
export const ready = () => set("ready");
/** Says the page went wrong, and why, in `data-error` on the body and on the console. */
export function failed(reason: string) {
  document.body.dataset.error = reason;
  console.error(`The page went wrong: ${reason}`);
  set("error");
}
export const isBusy = () => document.body.dataset.state === "busy";

let stepping = 0;

/** Whether a step's own work is under way: a screen drawn again meanwhile, at the address it was, is not the step's end. */
export const isStepping = () => stepping > 0;

/** What the doing line says, while the page is busy. */
export const sayingNow = () => saying;

/** `sayingNow`, as a component reads it. */
export function useSaying(): string | undefined {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, sayingNow);
}

/** What a step that failed leaves for a screen to say: what the rules refused, or what nobody expected. */
export interface Outcome {
  readonly refused: boolean;
  readonly said: string;
}

/**
 * Runs `step` with the page busy, saying `doing`; while the page is busy, another step does not start. A step that
 * resolves `true` has gone to another screen, which says `ready` once it is drawn; any other that resolves leaves the
 * page ready. One that throws leaves the page busy for the screen that says what went wrong, and resolves with what
 * that screen says: what the rules refused (`refusal(error)`) is not done, anything else has gone wrong.
 */
export async function flight(
  step: () => Promise<boolean | void>,
  doing: string,
  refusal: (error: unknown) => boolean,
): Promise<Outcome | undefined> {
  if (isBusy()) return undefined;
  busy(doing);
  stepping += 1;
  try {
    const went = await step();
    stepping -= 1;
    if (went !== true) ready();
    return undefined;
  } catch (error) {
    stepping -= 1;
    return {
      refused: refusal(error),
      said: error instanceof Error ? error.message : String(error),
    };
  }
}
