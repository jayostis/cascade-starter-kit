import { QUESTIONS, TOOLS as RUNTIME } from "cascade-runtime/tools";
import { beforeAll, describe, expect, it } from "vitest";
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
  reference_table_checks: [{ pod: "p" }, ["tables"]],
  open_pod: [{ pod: "p" }, ["pod"]],
  open_trend: [{ pod: "p", test: "t", medication: "m" }, ["trend"]],
  open_entry: [{ pod: "p", entry: "e" }, ["ask"]],
  open_classes: [{ pod: "p" }, ["pod"]],
  open_panel: [{ pod: "p", panel: "24326-1" }, ["pod"]],
  open_table: [{ table: "t" }, ["table"]],
  make_pod: [{ person: "Ann", encrypt: true }, ["makePod"]],
  check_tables: [{}, ["checkTables"]],
  set_world_date: [{ date: "2026-01-01" }, ["setWorldDate"]],
};
const ANSWERS: Record<string, unknown> = {
  pods: { pods: [{ name: "p" }] },
  tool: { value: [], found: [] },
  ask: { rows: [{ entry: "e" }] },
  trend: { series: { test: { notation: "t" } }, timeline: [] },
  tables: undefined,
};
const address = () => "/";

/**
 * `TOOLS` in `tools.ts` is the one list of tools the chat, the MCP server and a browser's agent are offered. Each tool has a
 * tier: `free` reads, `ask` changes the app and waits for the person. `NEVER` lists the PodApi operations no tool may call. A
 * tool you add needs a row in `RUNS`.
 */
describe("The tool list a model is offered · TOOLS, NEVER", () => {
  describe("TOOLS", () => {
    /** Each tool's tier, and the operations and inputs its `run` called when given the input its `RUNS` row names. */
    const ran = new Map<
      string,
      { tier: string; called: [string, Record<string, unknown>][] }
    >();

    beforeAll(async () => {
      for (const tool of TOOLS) {
        const [input] = RUNS[tool.name] ?? [{}];
        const called: [string, Record<string, unknown>][] = [];
        const recording = new Proxy(
          {},
          {
            get:
              (_, op: string) =>
              async (given: Record<string, unknown> = {}) => {
                called.push([op, given]);
                return op in ANSWERS ? ANSWERS[op] : {};
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
        ran.set(tool.name, { tier: tool.tier, called });
      }
    });

    it("holds exactly the tools `RUNS` has a row for", () => {
      expect(TOOLS.map(({ name }) => name).sort()).toEqual(
        Object.keys(RUNS).sort(),
      );
    });

    it("gives every tool the tier free or ask", () => {
      for (const [name, { tier }] of ran)
        expect(["free", "ask"], name).toContain(tier);
    });

    it("calls from each tool only the PodApi operations its row names", () => {
      for (const [name, { called }] of ran)
        expect(
          called.map(([op]) => op),
          name,
        ).toEqual(RUNS[name]?.[1]);
    });

    it("never calls an operation `NEVER` holds", () => {
      for (const [name, { called }] of ran)
        for (const [op, given] of called)
          expect(
            NEVER.some(
              (never) =>
                never.op === op &&
                (never.with === undefined || given[never.with] !== undefined),
            ),
            `${name} calls ${op}`,
          ).toBe(false);
    });
  });

  describe("given cascade-runtime's read tools", () => {
    it("carries each by its name, description and schema", () => {
      for (const { name, description, inputSchema, ofPod } of RUNTIME) {
        const mine = TOOLS.find((tool) => tool.name === name);
        expect(mine, name).toBeDefined();
        expect(
          {
            description: mine?.description,
            inputSchema: mine?.inputSchema,
            ofPod: mine?.ofPod,
          },
          name,
        ).toEqual({ description, inputSchema, ofPod });
      }
    });

    it("offers the runtime's questions as the `ask` tool's question", () => {
      const ask = TOOLS.find((tool) => tool.name === "ask");
      expect(
        (ask?.inputSchema.properties?.question as { enum?: string[] }).enum,
      ).toEqual(QUESTIONS);
    });
  });
});
