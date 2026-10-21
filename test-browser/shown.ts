import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Page } from "playwright";

const pageErrors = new WeakMap<Page, string[]>();

/** The page, with what went wrong in it collected for a failure's message. */
export function watched(page: Page): Page {
  const said: string[] = [];
  page.on("pageerror", (error) => said.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") said.push(message.text());
  });
  page.on("requestfailed", (request) =>
    said.push(`${request.url()}: ${request.failure()?.errorText ?? ""}`),
  );
  pageErrors.set(page, said);
  return page;
}

/** The page's last changes of state, as `doing.ts` keeps them, with when they were read, for a failure's message. */
async function traceOf(page: Page): Promise<string> {
  const now = await page.evaluate(() => Math.round(performance.now()));
  return `its last changes of state, read at ${now}:\n${(await page.getAttribute("body", "data-trace")) ?? "none"}`;
}

/**
 * Waits for try/ to finish its step, `timeout` ms at most; a page that reports an error, or never finishes, fails with
 * what it said and how it came to its state.
 */
export async function settled(page: Page, timeout = 120_000): Promise<void> {
  try {
    await page.waitForSelector(
      'body[data-state="ready"], body[data-state="error"]',
      { timeout },
    );
  } catch (error) {
    throw new Error(
      `try/ never finished: ${(pageErrors.get(page) ?? []).join("; ") || String(error)}\n${await traceOf(page).catch(() => "")}`,
      { cause: error },
    );
  }
  const state = await page.getAttribute("body", "data-state");
  if (state !== "ready")
    throw new Error(
      `try/ is ${state ?? "in no state"} and says: ${(await page.textContent("main")) ?? ""} (because ${(await page.getAttribute("body", "data-error")) ?? "it gave no reason"}) ${(pageErrors.get(page) ?? []).join("; ")}\n${await traceOf(page)}`,
    );
}

/** Does `act`, then waits for try/ to finish its step, which must have drawn the page in place, never loading one. */
export async function inPlace(
  page: Page,
  act: () => Promise<unknown>,
): Promise<void> {
  const mark = (): Promise<unknown> =>
    page.evaluate(() => (globalThis as { stayed?: boolean }).stayed);
  await page.evaluate(() => {
    (globalThis as { stayed?: boolean }).stayed = true;
  });
  await act();
  await settled(page);
  assert.equal(await mark(), true, "try/ loaded a page");
}

/**
 * Opens the new-pod box and clicks the choice that holds `label`, then waits for the pod's page, drawn in place: the
 * page says it is ready only once it is at the new pod's address, never at the address it was made from.
 */
export async function newPod(page: Page, label: string): Promise<void> {
  const at = (): string => {
    const { pathname, search } = new URL(page.url());
    return pathname + search;
  };
  const from = at();
  await page.click('a[href="#new-pod"]');
  await inPlace(page, () =>
    page.click(`#new-pod button:has-text(${JSON.stringify(label)})`),
  );
  if (at() === from)
    assert.fail(
      `the page said it was ready before it moved\n${await traceOf(page)}`,
    );
}

/**
 * Waits for the page showing to be drawn, `timeout` ms at most: its `main` is there, nothing in it is pending, and the
 * body is not busy and says `ready` (`opening` and any other state wait); it cannot tell a screen from before a click
 * from the one the click brings, so after a click that changes the screen wait for what the new one shows first.
 */
export async function drawn(page: Page, timeout = 120_000): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const state = document.body?.dataset.state;
        return (
          state === "error" ||
          (document.querySelector("main") !== null &&
            document.querySelector('[aria-busy="true"]') === null &&
            (state === undefined || state === "ready"))
        );
      },
      undefined,
      { timeout },
    );
  } catch (error) {
    throw new Error(
      `${page.url()} was never drawn: ${(pageErrors.get(page) ?? []).join("; ") || String(error)}`,
      { cause: error },
    );
  }
  if ((await page.getAttribute("body", "data-state")) === "error")
    throw new Error(
      `${page.url()} says: ${(await page.textContent("main")) ?? ""} (because ${(await page.getAttribute("body", "data-error")) ?? "it gave no reason"})`,
    );
}

/** What a person reads of the page: the text of its body, its scripts and styles left out, its closed boxes kept. */
export function readable(page: Page): Promise<string> {
  return page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    for (const left of body.querySelectorAll("script, style")) left.remove();
    return (body.textContent ?? "").trim();
  });
}

/** Each tile the pod's page shows, by its kind, with the count it shows. */
export async function tiles(page: Page): Promise<Map<string, number>> {
  return new Map(
    await page.$$eval(".tiles .tile", (shown) =>
      shown.map(
        (tile) =>
          [
            tile.querySelector(".kind")?.textContent ?? "",
            Number(tile.querySelector(".count")?.textContent),
          ] as [string, number],
      ),
    ),
  );
}

/** A tool a page registered with the model context, as the stand-in `recordTools` keeps it. */
export interface Registered {
  registered: {
    name: string;
    signal: AbortSignal;
    tool: {
      inputSchema: { properties?: object; required?: string[] };
      execute(input: object): Promise<unknown>;
    };
  }[];
}

/**
 * Gives every page of the context a stand-in `document.modelContext`, as WebMCP's gives one, recording each tool
 * registered and the signal that takes it away. Run it in a page: `context.addInitScript(recordTools)`.
 */
export function recordTools(): void {
  const registered: Registered["registered"] = [];
  Object.assign(globalThis, { registered });
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: {
      registerTool: (
        tool: Registered["registered"][number]["tool"] & { name: string },
        options: { signal: AbortSignal },
      ) => {
        registered.push({ name: tool.name, signal: options.signal, tool });
      },
    },
  });
}

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The tools of the one list (`tools.ts`), which every screen offers the model context, and the names of the ops that
 * no tool at all calls (`makePod` is not one: only a call with `encrypt` is).
 */
export async function listed(): Promise<{
  names: string[];
  never: string[];
}> {
  const { TOOLS, NEVER } = (await import(
    pathToFileURL(join(ROOT, "app", "tools.ts")).href
  )) as {
    TOOLS: { name: string }[];
    NEVER: { op: string; with?: string }[];
  };
  return {
    names: TOOLS.map(({ name }) => name).sort(),
    never: NEVER.filter(({ with: given }) => given === undefined).flatMap(
      ({ op }) => [
        op,
        op.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      ],
    ),
  };
}

/** The names of the tools the page offers the model context now, sorted. */
export function offered(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (globalThis as unknown as Registered).registered
      .filter(({ signal }) => !signal.aborted)
      .map(({ name }) => name)
      .sort(),
  );
}

/** Waits until the page offers the tool `name`, and with `pod` given, until its input does or does not take the pod. */
async function offering(
  page: Page,
  name: string,
  pod?: boolean,
): Promise<void> {
  await page.waitForFunction(
    ([wanted, takesPod]) =>
      (globalThis as unknown as Registered).registered.some(
        ({ name, signal, tool }) =>
          name === wanted &&
          !signal.aborted &&
          (takesPod === undefined ||
            Object.hasOwn(tool.inputSchema.properties ?? {}, "pod") ===
              takesPod),
      ),
    [name, pod] as const,
  );
}

/**
 * The properties and the required ones of the input of the tool `name`, as the page offers it once its input does
 * (`takesPod`) or does not take the pod's name.
 */
export async function inputOf(
  page: Page,
  name: string,
  takesPod: boolean,
): Promise<{ properties: string[]; required: string[] }> {
  await offering(page, name, takesPod);
  return page.evaluate((wanted) => {
    const { inputSchema } = (globalThis as unknown as Registered).registered
      .filter(({ signal }) => !signal.aborted)
      .find(({ name }) => name === wanted)!.tool;
    return {
      properties: Object.keys(inputSchema.properties ?? {}),
      required: inputSchema.required ?? [],
    };
  }, name);
}

/** Calls the tool `name` the page offers with `input`: what it resolved with, or the message of what it threw. */
export async function called(
  page: Page,
  name: string,
  input: object = {},
  takesPod?: boolean,
): Promise<{ result: unknown } | { error: string }> {
  await offering(page, name, takesPod);
  return page.evaluate(
    async ([wanted, given]) => {
      const { tool } = (globalThis as unknown as Registered).registered
        .filter(({ signal }) => !signal.aborted)
        .find(({ name }) => name === wanted)!;
      try {
        return { result: await tool.execute(given as object) };
      } catch (error) {
        return { error: (error as Error).message };
      }
    },
    [name, input] as const,
  );
}
