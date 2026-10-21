// What every screen shares: the loader that reads it and says what the rules refused, the note a step left above it,
// the screen drawn from what its loader read or from what its action said, and the parts still to come.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useActionData,
  useLoaderData,
  useRouteError,
  useRouteLoaderData,
  type LoaderFunctionArgs,
} from "react-router";
import { personName, type Person, type Series, type Source } from "../said.ts";
import { BASE, useAddress } from "./address.tsx";
import type { PodListed } from "./api.tsx";
import { failed, ready } from "./doing.ts";
import { note as noteLook } from "./look.ts";
import { Unlock } from "./newpod.tsx";
import { closeBox } from "./parts.tsx";
import type { TablesHeld } from "./shell.tsx";

/** What a screen's own read gives: what it draws, the tab's title, and what the page is busy with or why it went wrong. */
export interface Said<T> {
  readonly value: T;
  readonly title: string;
  /** What the page is busy with while this read is under way, as a connection is followed. */
  readonly busy?: string;
  /** Why the page went wrong, though the screen is drawn. */
  readonly failed?: string;
}

/** What a screen's loader read: the screen's own, what the rules refused, or a locked pod; and a step's note. */
export type Read<T> = (
  | Said<T>
  | { readonly refused: string }
  | { readonly locked: { readonly pod: string; readonly outcome: string } }
) & { readonly note?: string };

/** What a step's action said, where it stayed on its screen: refused, or the hospital's page to leave for. */
export interface Did {
  readonly refused?: string;
  readonly leave?: string;
}

let left: { readonly at: string; readonly text: string } | undefined;

/** The router's path of a request's address, without its hash. */
const pathOf = (url: URL) => `/${url.pathname.slice(BASE.length)}${url.search}`;

/** Leaves `text` above the screen at the router path `at`, where the step about to move goes. */
export function leaveNote(at: string, text: string | undefined) {
  left = text === undefined ? undefined : { at: at.split("#")[0] ?? at, text };
}

/** The note a step left for the screen at `url`; it is drawn once, by the next screen read. */
function takeNote(url: string): string | undefined {
  const note = left;
  left = undefined;
  return note?.at === pathOf(new URL(url)) ? note.text : undefined;
}

const isNamed = (error: unknown, name: string): error is Error =>
  error instanceof Error && error.name === name;

/**
 * A route's loader from `read`: a `Refusal` is the screen's own "Not found" and an `Unopened` pod its unlock screen,
 * drawn where they were asked for; anything else thrown is the route's error.
 */
export function screen<T>(
  read: (args: LoaderFunctionArgs) => Promise<Said<T>>,
) {
  return async (args: LoaderFunctionArgs): Promise<Read<T>> => {
    const note = takeNote(args.request.url);
    const noted = note === undefined ? {} : { note };
    try {
      return { ...(await read(args)), ...noted };
    } catch (error) {
      if (isNamed(error, "Unopened"))
        return {
          locked: {
            pod: args.params.pod ?? "",
            outcome:
              (error as Error & { outcome?: string }).outcome ??
              "secret needed",
          },
          ...noted,
        };
      if (isNamed(error, "Refusal"))
        return { refused: error.message, ...noted };
      throw error;
    }
  };
}

/** The value the route's loader read, for the screen it draws. */
export const useRead = <T,>(): T =>
  (useLoaderData() as { readonly value: T }).value;

/** What the root route reads for every screen: the pods, the demo people and the reference tables held. */
export interface AppRead {
  readonly pods: readonly PodListed[];
  readonly people: readonly Person[];
  readonly held: TablesHeld | Promise<TablesHeld>;
}

/** What the root route read, with the name each pod was made under by its name. */
export function useApp(): AppRead & {
  readonly titles: ReadonlyMap<string, string>;
} {
  const read = useRouteLoaderData("root") as AppRead;
  const titles = useMemo(
    () => new Map(read.pods.map(({ name, title }) => [name, title])),
    [read.pods],
  );
  return { ...read, titles };
}

/**
 * `value` once it has come: at once when a loader read it, else when its promise settles, `undefined` meanwhile. The
 * screen stays drawn while it waits, so a box open over it and what was typed there stay.
 */
export function useLate<T>(value: T | Promise<T>): T | undefined {
  const [came, setCame] = useState<{ from: Promise<T>; value: T }>();
  useEffect(() => {
    if (!(value instanceof Promise)) return;
    let live = true;
    value.then(
      (settled) => live && setCame({ from: value, value: settled }),
      (error: unknown) =>
        live &&
        failed(
          `a part of the screen could not be read: ${error instanceof Error ? error.message : String(error)}`,
        ),
    );
    return () => {
      live = false;
    };
  }, [value]);
  if (!(value instanceof Promise)) return value;
  return came?.from === value ? came.value : undefined;
}

/**
 * The last step refused on the screen its loader read, kept by that read: the router forgets a step's answer at the
 * next move, a box opened by its hash among them, while the screen read is the same until it is read again.
 */
const refusals = new WeakMap<object, string>();

/**
 * The screen a route draws: `children`, from what its loader read, under the note a step left; or what the rules
 * refused, the screen's own "Not found" or a step's "Not done"; or a locked pod's unlock screen. A step that leaves
 * for a hospital's own page goes there once the page is ready.
 */
export function Screen({ children }: { children: ReactNode }) {
  const read = useLoaderData() as Read<unknown>;
  const did = useActionData() as Did | undefined;
  const { titles } = useApp();
  if (did?.refused !== undefined) refusals.set(read, did.refused);
  const refused = refusals.get(read);
  const title =
    refused !== undefined
      ? "Not done"
      : "title" in read
        ? read.title
        : "locked" in read
          ? "Open this pod"
          : "Not found";
  useEffect(() => {
    document.title = `${title} · Cascade`;
  }, [title]);
  useEffect(() => {
    if (did?.refused !== undefined) closeBox();
  }, [did]);
  useEffect(() => {
    if (did?.leave === undefined) return;
    ready();
    location.assign(did.leave);
  }, [did]);
  return (
    <>
      {read.note !== undefined && (
        <p className={noteLook} role="status">
          {read.note}
        </p>
      )}
      {refused !== undefined ? (
        <>
          <h1>Not done</h1>
          <p>{refused}</p>
        </>
      ) : "locked" in read ? (
        <Unlock
          key={read.locked.pod}
          pod={read.locked.pod}
          titles={titles}
          outcome={read.locked.outcome}
        />
      ) : "refused" in read ? (
        <NotFound said={read.refused} />
      ) : (
        children
      )}
    </>
  );
}

/** What a route draws when its read or its step went wrong for a reason that is no refusal. */
export function Broken() {
  const error = useRouteError();
  useEffect(() => {
    document.title = "Something went wrong · Cascade";
  }, []);
  return (
    <Wrong said={error instanceof Error ? error.message : String(error)} />
  );
}

/** The link back to the pod's page. */
export function Back({
  pod,
  titles,
}: {
  pod: string;
  titles: ReadonlyMap<string, string>;
}) {
  const address = useAddress();
  return (
    <p>
      <a href={address.pod(pod)}>Back to {personName(pod, titles)}</a>
    </p>
  );
}

/** A screen the rules refused to draw, with `said` the reason. */
export function NotFound({ said }: { said: string }) {
  return (
    <>
      <h1>Not found</h1>
      <p>{said}</p>
    </>
  );
}

/** A screen that could not be read for a reason that is no refusal. */
export function Wrong({ said }: { said: string }) {
  return (
    <>
      <h1>Something went wrong</h1>
      <p>{said}</p>
    </>
  );
}

/** The source of the series among `sources`, for a link to its page. */
export const sourceOf = (
  sources: readonly Source[],
  series: Pick<Series, "iri">,
): Source | undefined =>
  sources.find((each) => each.series.some(({ iri }) => iri === series.iri));
