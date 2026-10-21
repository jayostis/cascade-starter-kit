// What the screens that only read share: asking PodApi once for the address shown, saying when the screen is drawn, and
// drawing what the rules refused as the screen's own "Not found".
import { useEffect, useRef, useState } from "react";
import { personName, type Series, type Source } from "../said.ts";
import { useAddress, useGeneration } from "./address.tsx";
import { usePodApi, type PodApi } from "./api.tsx";
import { failed, ready } from "./doing.ts";

/** What a read of the screen's address came to: its data, the sentence of a refusal, or what went wrong. */
export type Loaded<T> = { readonly at: string } & (
  | { readonly value: T }
  | { readonly refused: string }
  | { readonly wrong: string }
);

const sentenceOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Calls `load` for the address `at`, and again when `again` changes, a step moves the app (`useGeneration`) or the
 * address does; the last answer stays until the next arrives. Once the answer to `at` is in, the tab says `titleOf` of
 * it ("Not found" for a refusal) and the body says `ready`, or `error` for a failure that is no refusal. A `load` that
 * has more to add once the screen is drawn calls `later` with the whole value again. The page is busy between answers
 * as `useOpening` and a step say.
 */
export function useLoaded<T>(
  at: string,
  load: (api: PodApi, later: (value: T) => void) => Promise<T>,
  titleOf: (value: T) => string,
  again?: unknown,
): Loaded<T> | undefined {
  const api = usePodApi();
  const [loaded, setLoaded] = useState<Loaded<T>>();
  const generation = useGeneration();
  const latest = useRef({ load, titleOf });
  useEffect(() => {
    latest.current = { load, titleOf };
  });
  useEffect(() => {
    let live = true;
    latest.current
      .load(api, (value) => live && setLoaded({ at, value }))
      .then(
        (value) => live && setLoaded({ at, value }),
        (error: unknown) =>
          live &&
          setLoaded(
            error instanceof Error && error.name === "Refusal"
              ? { at, refused: error.message }
              : { at, wrong: sentenceOf(error) },
          ),
      );
    return () => {
      live = false;
    };
  }, [api, at, again, generation]);
  useEffect(() => {
    if (loaded?.at !== at) return;
    if ("wrong" in loaded)
      return failed(`the screen could not be read: ${loaded.wrong}`);
    document.title = `${"refused" in loaded ? "Not found" : latest.current.titleOf(loaded.value)} · Cascade`;
    ready();
  }, [loaded, at]);
  return loaded;
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
