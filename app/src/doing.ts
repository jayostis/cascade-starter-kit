// What the page is doing, in `data-state` on the body: `opening` until the first screen is drawn, `busy` while the
// router reads a screen or runs a step, `ready` once what it read is drawn, `error` when a read or a step went wrong.
// While it is busy, the doing line says what it is doing and every button is off. The suites wait on this attribute,
// so it is set as the router changes, never later.
import { useLayoutEffect, useSyncExternalStore } from "react";
import {
  useFetchers,
  useLocation,
  useMatches,
  useNavigation,
  useRevalidator,
  type createBrowserRouter,
} from "react-router";
import { personName } from "../said.ts";

type Router = ReturnType<typeof createBrowserRouter>;
type RouterState = Router["state"];
type State = "opening" | "busy" | "ready" | "error";

let saying: string | undefined;
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

const switchButtons = (off: boolean) => {
  for (const button of document.querySelectorAll("button"))
    button.disabled = off;
};

/** Whether a step is under way: from a submission, or a move a tool asked for, until the page next says ready. */
let stepping = false;

function set(state: State, said?: string) {
  const { dataset } = document.body;
  if (dataset.state === state && saying === said) return;
  trace(`${state}${said === undefined ? "" : ` "${said}"`}`);
  dataset.state = state;
  if (state !== "error") delete dataset.error;
  switchButtons(state === "busy");
  saying = said;
  if (state !== "busy") stepping = false;
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
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    sayingNow,
    sayingNow,
  );
}

const sentenceOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** What a submission says it is doing: a search, or what its form's `doing` field says. */
const formSaid = (form: FormData | undefined, method: string) =>
  method.toUpperCase() === "GET"
    ? "Searching…"
    : String(form?.get("doing") ?? "") || "Working…";

/** "Opening <person>'s pod…" on the way to a pod's address, "Opening…" to any other. */
function opening(state: RouterState, pathname: string): string {
  const name = /\/pods\/([^/]+)/.exec(pathname)?.[1];
  if (name === undefined) return "Opening…";
  const { pods = [] } = (state.loaderData.root ?? {}) as {
    pods?: readonly { name: string; title: string }[];
  };
  const titles = new Map(pods.map(({ name, title }) => [name, title]));
  return `Opening ${personName(decodeURIComponent(name), titles)}'s pod…`;
}

/** A field of the data a matched route's loader read, which a screen sets while it is busy or once it went wrong. */
function readSays(state: RouterState, field: "busy" | "failed") {
  for (const { route } of state.matches) {
    const said = (state.loaderData[route.id] ?? {}) as Record<string, unknown>;
    if (typeof said[field] === "string") return said[field];
  }
  return undefined;
}

/**
 * What the page is busy with in `state`: a move or a submission the router is running, a fetcher's, a read still under
 * way (a connection followed); nothing once the router has read and run all it was asked to.
 */
function doingOf(state: RouterState): string | undefined {
  const { navigation, fetchers, revalidation } = state;
  if (navigation.state !== "idle")
    return navigation.formMethod === undefined
      ? opening(state, navigation.location.pathname)
      : formSaid(navigation.formData, navigation.formMethod);
  for (const fetcher of fetchers.values())
    if (fetcher.state !== "idle")
      return formSaid(fetcher.formData, fetcher.formMethod ?? "POST");
  return (
    readSays(state, "busy") ??
    (revalidation === "idle" ? undefined : "Working…")
  );
}

const stepIn = ({ navigation, fetchers }: RouterState) =>
  navigation.formMethod !== undefined ||
  (navigation.location?.state as { step?: unknown } | null)?.step === true ||
  [...fetchers.values()].some(({ formMethod }) => formMethod !== undefined);

function failureOf(state: RouterState): string | undefined {
  const [error] = Object.values(state.errors ?? {});
  if (error !== undefined)
    return `the screen could not be drawn: ${sentenceOf(error)}`;
  return readSays(state, "failed");
}

const busyFetchers = (fetchers: Iterable<{ readonly state: string }>) =>
  [...fetchers].filter(({ state }) => state !== "idle").length;

const stillFilling = () =>
  document.querySelector('main [aria-busy="true"]') !== null;

let router: Router | undefined;
let filling: MutationObserver | undefined;

/** Says the page is busy the moment `watched` starts to read or run anything, and lets `PageState` read it. */
export function watch(watched: Router) {
  router = watched;
  watched.subscribe((state) => {
    if (!state.initialized) return;
    const doing = doingOf(state);
    if (doing === undefined) return;
    if (stepIn(state)) stepping = true;
    filling?.disconnect();
    busy(doing);
  });
}

/**
 * Says the page is ready, or went wrong, in the commit that draws what the router last read, never in a commit of an
 * older state. After a step, ready waits for the parts of `main` still filling (`aria-busy`) too, so that nothing a
 * step brought is drawn after the page says it is ready; after a plain move they fill in after it.
 */
export function PageState(): null {
  const location = useLocation();
  const navigation = useNavigation();
  const matches = useMatches();
  const fetchers = useFetchers();
  const { state: revalidation } = useRevalidator();
  useLayoutEffect(() => {
    if (router === undefined) return;
    const now = router.state;
    if (
      location.key !== now.location.key ||
      navigation.state !== now.navigation.state ||
      revalidation !== now.revalidation ||
      busyFetchers(fetchers) !== busyFetchers(now.fetchers.values()) ||
      matches.some(({ id, loaderData }) => loaderData !== now.loaderData[id])
    )
      return;
    filling?.disconnect();
    const doing = doingOf(now);
    if (doing !== undefined) {
      busy(doing);
      return switchButtons(true);
    }
    const failure = failureOf(now);
    if (failure !== undefined) return failed(failure);
    const main = document.querySelector("main");
    if (!stepping || main === null || !stillFilling()) return ready();
    filling = new MutationObserver(() => {
      if (router?.state !== now || stillFilling()) return;
      filling?.disconnect();
      ready();
    });
    filling.observe(main, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-busy"],
    });
  });
  return null;
}
