// Every screen's address, path-shaped, under the base the app is served from: the one table the app's links, the
// chat's `open_*` tools and MCP's `view` take addresses from. A view never builds one.
import { entryId } from "./said.ts";

/** A trend's test, a LOINC code, and its medication, an RxNorm code or a name where the drug has none. */
export interface Trend {
  readonly test: string;
  readonly medication?: string | undefined;
}

/** What a reference table's page is asked for: a search, its page of results, or one code. */
export interface TableQuery {
  readonly q?: string | undefined;
  readonly page?: number | undefined;
  readonly code?: string | undefined;
}

const query = (fields: Record<string, string | number | undefined>): string => {
  const given = Object.entries(fields).flatMap(([name, value]) =>
    value === undefined ? [] : [[name, String(value)]],
  );
  return given.length === 0 ? "" : `?${new URLSearchParams(given)}`;
};

/** The addresses of the app served under `base`, a path ending in `/`. */
export function addresses(base = "/") {
  const pod = (name: string) => `${base}pods/${encodeURIComponent(name)}/`;
  return {
    home: base,
    pod,
    entry: (name: string, entry: string) =>
      `${pod(name)}entries/${encodeURIComponent(entryId(entry))}`,
    trend: (name: string, { test, medication }: Trend) =>
      `${pod(name)}trend${query({ test, medication })}`,
    classes: (name: string, picked?: string) =>
      `${pod(name)}classes${query({ class: picked })}`,
    panel: (name: string, panel: string) =>
      `${pod(name)}panel${query({ panel })}`,
    hospitals: (name: string, q?: string) =>
      `${pod(name)}hospitals${query({ q })}`,
    connection: (name: string, connection: number) =>
      `${pod(name)}${query({ connection })}#connection`,
    table: (id?: string, asked: TableQuery = {}) =>
      `${base}tables/${id === undefined ? "" : `${encodeURIComponent(id)}/`}${query({ ...asked })}`,
    words: (name: string) =>
      `${base}encrypted-pods/${encodeURIComponent(name)}`,
  };
}

export type Addresses = ReturnType<typeof addresses>;

/** The first path segments of the screens; any other path under the base is a file or one the server answers itself. */
const SCREENS = /^(pods|tables|encrypted-pods)(\/|$)/;

/**
 * Whether a click on `link` moves the app to `to` without leaving the page: an address of one of its screens under
 * `base`, on `from`'s origin, and not a download, a link that opens another window, or a file (`signed-in.html`, a
 * `.json`) or a route (`/api/…`, `/callback`) the server answers, all of which the browser follows.
 */
export function movesInPlace(
  link: { readonly target: string; readonly download: boolean },
  to: URL,
  from: URL,
  base: string,
): boolean {
  if (link.download || (link.target !== "" && link.target !== "_self"))
    return false;
  if (to.origin !== from.origin || !to.pathname.startsWith(base)) return false;
  return SCREENS.test(to.pathname.slice(base.length)) || to.pathname === base;
}
