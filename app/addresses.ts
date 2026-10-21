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
    table: (id?: string, asked: TableQuery = {}) =>
      `${base}tables/${id === undefined ? "" : `${encodeURIComponent(id)}/`}${query({ ...asked })}`,
  };
}

export type Addresses = ReturnType<typeof addresses>;
