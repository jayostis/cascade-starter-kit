// What the page is doing, in `data-state` on the body: `opening` until the first screen is drawn, `busy` while it goes
// to another or acts, `ready` once the screen asked for is drawn, `error` when something went wrong. While it is busy,
// the doing line says what it is doing and every button is off. The suites wait on this attribute, so it is set as the
// page changes, never later.
import { useSyncExternalStore } from "react";

type State = "opening" | "busy" | "ready" | "error";

let saying: string | undefined;
let stepping = false;
let movedOn = false;
let moving: { readonly mark: number; readonly path: string } | undefined;
const listeners = new Set<() => void>();
let drawn: () => void = () => undefined;

/** Settles once the first screen is drawn, so that what loads in the background comes after it. */
export const firstReady = new Promise<void>((resolve) => {
  drawn = resolve;
});

const TRACED = 8;
const traced: string[] = [];

/**
 * Keeps the page's last few changes of state, each with where it was and who asked, in `data-trace` on the body, so
 * that a suite's failure says how the page came to the state it found.
 */
function trace(what: string) {
  const callers = (new Error().stack ?? "")
    .split("\n")
    .slice(3, 6)
    .map((frame) => frame.trim().replace(/^at /, ""));
  traced.push(
    `${Math.round(performance.now())} ${what} at ${globalThis.location?.pathname ?? ""} by ${callers.join(" < ")}`,
  );
  if (traced.length > TRACED) traced.shift();
  document.body.dataset.trace = traced.join("\n");
}

function set(state: State, said?: string) {
  trace(`${state}${said === undefined ? "" : ` "${said}"`}`);
  document.body.dataset.state = state;
  if (state !== "error") delete document.body.dataset.error;
  for (const button of document.querySelectorAll("button"))
    button.disabled = state === "busy";
  saying = said;
  if (state !== "busy") {
    stepping = false;
    movedOn = false;
    moving = undefined;
  }
  if (state === "ready") drawn();
  for (const listener of listeners) listener();
}

export const busy = (said = "Working…") => set("busy", said);
/** Ignored while a step runs and its move is not yet drawn: a screen drawn meanwhile is not the step's end. */
export function ready() {
  if (stepping && !movedOn) return trace("ready ignored");
  set("ready");
}
/** Says the page went wrong, and why, in `data-error` on the body and on the console. */
export function failed(reason: string) {
  document.body.dataset.error = reason;
  console.error(`The page went wrong: ${reason}`);
  set("error");
}
export const isBusy = () => document.body.dataset.state === "busy";

/**
 * Whether a step is under way: from its start until the screen its own move lands on says the page is ready (or the
 * step stayed, or the page went wrong). `ready` is ignored until the step's move is drawn, so a screen drawn again
 * meanwhile at the address the step left is not taken for the step's end.
 */
export const isStepping = () => stepping;

/** Ends the step under way where it is: the screen shown says when it is ready. */
export function stayed() {
  stepping = false;
}

/**
 * The step under way has asked to move to the router path `path`, in a location whose history state carries `mark`:
 * the move is drawn in a later commit, and until then the screen being left may still say ready.
 */
export function moved(mark: number, path: string) {
  moving = { mark, path };
  trace(`moved ${mark} to ${path}`);
}

/**
 * A commit has drawn the router path `path`, in a location whose history state carries `mark`: when it is the step's
 * own move, by its mark or, since a redirect drops the mark, by its path, the screen drawn there may now say ready.
 */
export function landed(mark: number | undefined, path: string) {
  if (!stepping || moving === undefined) return;
  if (mark !== moving.mark && path !== moving.path) return;
  movedOn = true;
  trace(`landed ${mark ?? "unmarked"} at ${path}`);
}

/** Settles once the page is not busy: at once when it is not, else when it next says ready or error. */
export function settled(): Promise<void> {
  if (!isBusy()) return Promise.resolve();
  return new Promise((resolve) => {
    const listener = () => {
      if (isBusy()) return;
      listeners.delete(listener);
      resolve();
    };
    listeners.add(listener);
  });
}

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
  stepping = true;
  movedOn = false;
  moving = undefined;
  try {
    if ((await step()) !== true) set("ready");
    return undefined;
  } catch (error) {
    movedOn = true;
    return {
      refused: refusal(error),
      said: error instanceof Error ? error.message : String(error),
    };
  }
}
