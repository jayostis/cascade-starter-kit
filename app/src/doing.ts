// What the page is doing, in `data-state` on the body: `opening` until the first screen is drawn, `busy` while it goes
// to another or acts, `ready` once the screen asked for is drawn, `error` when something went wrong. While it is busy,
// the doing line says what it is doing. The suites wait on this attribute, so it is set as the page changes, never later.
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
  saying = said;
  if (state === "ready") drawn();
  for (const listener of listeners) listener();
}

export const busy = (said = "Working…") => set("busy", said);
export const ready = () => set("ready");
export const failed = () => set("error");

/** What the doing line says, while the page is busy. */
export function useSaying(): string | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => saying,
  );
}
