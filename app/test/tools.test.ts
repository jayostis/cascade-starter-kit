import { expect, test } from "vitest";
import { NEVER, TOOLS } from "../tools.ts";

/** What each tool is given, and the PodApi operations it may call. A tool added to `TOOLS` needs a row. */
const RUNS: Record<string, [Record<string, unknown>, string[]]> = {
  list_pods: [{}, ["pods"]],
  find_changes: [{ pod: "p" }, ["tool"]],
  finding_rows: [{ pod: "p", key: "k" }, ["tool"]],
  lab_series: [{ pod: "p", test: "t" }, ["tool"]],
  timeline: [{ pod: "p" }, ["tool"]],
  worth_a_look: [{ pod: "p" }, ["tool"]],
  ask: [{ pod: "p", question: "pod/My lab results" }, ["ask"]],
  open_pod: [{ pod: "p" }, ["pod"]],
  open_trend: [{ pod: "p", test: "t", medication: "m" }, ["trend"]],
  open_entry: [{ pod: "p", entry: "e" }, ["ask"]],
  open_classes: [{ pod: "p" }, ["pod"]],
  open_panel: [{ pod: "p", panel: "24326-1" }, ["pod"]],
  open_table: [{ table: "t" }, ["table"]],
  make_pod: [{ person: "Ann" }, ["makePod"]],
  check_tables: [{}, ["checkTables"]],
  set_world_date: [{ date: "2026-01-01" }, ["setWorldDate"]],
};
const ANSWERS: Record<string, unknown> = {
  pods: { pods: [{ name: "p" }] },
  tool: { value: [], found: [] },
  ask: { rows: [{ entry: "e" }] },
  trend: { series: { test: { notation: "t" } }, timeline: [] },
};
const address = () => "/";

test("every tool is free or ask, and calls no operation the never list holds", async () => {
  expect(TOOLS.map(({ name }) => name).sort()).toEqual(
    Object.keys(RUNS).sort(),
  );
  for (const tool of TOOLS) {
    const [input, expected] = RUNS[tool.name];
    expect(["free", "ask"], tool.name).toContain(tool.tier);
    const called: [string, Record<string, unknown>][] = [];
    const recording = new Proxy(
      {},
      {
        get:
          (_, op: string) =>
          async (given: Record<string, unknown> = {}) => {
            called.push([op, given]);
            return ANSWERS[op] ?? {};
          },
      },
    );
    await tool.run(recording as never, input, {
      open: async () => {},
      address: {
        pod: address,
        trend: address,
        entry: address,
        classes: address,
        panel: address,
        table: address,
      },
    });
    expect(
      called.map(([op]) => op),
      tool.name,
    ).toEqual(expected);
    for (const [op, given] of called)
      expect(
        NEVER.some(
          (never) =>
            never.op === op &&
            (never.with === undefined || given[never.with] !== undefined),
        ),
        `${tool.name} calls ${op}`,
      ).toBe(false);
  }
});
