import assert from "node:assert/strict";
import { test } from "node:test";
import { screens, textOf } from "./render.js";

/** A host whose PodApi is `api`, as the routes take it, and whose engine lands when `engine` settles. */
interface HostOf {
  api: object;
  engine?: Promise<void>;
}

/** What the test reads of a memory router of the app's routes. */
interface Router {
  readonly state: { readonly initialized: boolean };
  navigate(to: string, options?: object): Promise<void>;
}

/** The app's routes in a memory router, drawn and watched as the page draws and watches them. */
interface Routed {
  /** The routes over `api` at `at`, once settled; with `posted`, after that step; with `then`, after that move too. */
  draw(
    api: object,
    at: string,
    posted?: Readonly<Record<string, string>>,
    then?: string,
  ): Promise<string>;
  /** The routes over `host` at `at`, their state watched as `main.tsx` watches it, once settled. */
  watched(host: HostOf, at: string): Promise<Router>;
  idle(router: Router): Promise<void>;
  ready(): void;
  isBusy(): boolean;
  sayingNow(): string | undefined;
  warm(host: object): void;
}

const routed = await screens<Routed>(`
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "./App.tsx";
import { HostProvider } from "./api.tsx";
import { watch } from "./doing.ts";
export { isBusy, ready, sayingNow } from "./doing.ts";
export { warm } from "./engine.ts";

export const idle = (router) =>
  new Promise((resolve) => {
    const done = ({ initialized, navigation, revalidation }) =>
      initialized && navigation.state === "idle" && revalidation === "idle";
    if (done(router.state)) return resolve();
    const stop = router.subscribe((state) => {
      if (!done(state)) return;
      stop();
      resolve();
    });
  });

const hostOf = ({ api, engine = new Promise(() => undefined) }) => ({
  api,
  about: { name: "Cascade", version: "0", runtime: "0" },
  samples: [],
  people: async () => [],
  firstVisit: async () => undefined,
  engine: () => engine,
  tables: async () => undefined,
  reads: { list: async () => [], run: async () => ({}) },
});

const drawn = (host, router) =>
  renderToStaticMarkup(
    <HostProvider value={host}>
      <RouterProvider router={router} />
    </HostProvider>,
  );

export async function draw(api, at, posted, then) {
  const host = hostOf({ api });
  const router = createMemoryRouter(routes(host), { initialEntries: [at] });
  await idle(router);
  if (posted !== undefined) {
    const formData = new FormData();
    for (const [name, value] of Object.entries(posted)) formData.set(name, value);
    await router.navigate(at, { formMethod: "post", formData });
    await idle(router);
  }
  if (then === undefined) return drawn(host, router);
  drawn(host, router);
  await router.navigate(then);
  await idle(router);
  return drawn(host, router);
}

export async function watched(given, at) {
  const host = hostOf(given);
  const router = createMemoryRouter(routes(host), { initialEntries: [at] });
  watch(router);
  await idle(router);
  return router;
}
`);

const body = { dataset: {} as Record<string, string | undefined> };
const buttons = [{ disabled: false }, { disabled: false }];
Object.assign(globalThis, {
  document: { body, querySelectorAll: () => buttons },
});

const refused = (message: string) =>
  Object.assign(new Error(message), { name: "Refusal" });

/** A PodApi of one empty pod, whose world's date refuses any date. */
const api = {
  pods: async () => ({ pods: [{ name: "alex-rivera", title: "Alex Rivera" }] }),
  pod: async () => ({
    name: "alex-rivera",
    title: "Alex Rivera",
    encrypted: false,
  }),
  answers: async () => ({ answers: {}, changes: [] }),
  hospitals: async () => ({ rows: [] }),
  setWorldDate: async ({ date }: { date: string }) => {
    throw refused(`"${date}" is not a date.`);
  },
};

const main = (markup: string) =>
  textOf(/<main\b[^>]*>([\s\S]*)<\/main>/.exec(markup)?.[1] ?? "");

test("a screen is drawn from its route's loader, and a step its action refuses is drawn as Not done with the rules' sentence, never as gone wrong, which stays when a box is opened over it", async () => {
  const pod = main(await routed.draw(api, "/pods/alex-rivera/"));
  assert.match(pod, /^Alex Rivera Nothing here yet\./);
  const set = { intent: "world-date", date: "soon" };
  const NOT_DONE = /^Not done "soon" is not a date\.$/;
  assert.match(main(await routed.draw(api, "/pods/alex-rivera/", set)), NOT_DONE);
  assert.match(
    main(
      await routed.draw(
        api,
        "/pods/alex-rivera/",
        set,
        "/pods/alex-rivera/#new-pod",
      ),
    ),
    NOT_DONE,
  );
});

test("a read of an encrypted pod that will not open draws the pod's unlock screen at the address asked for", async () => {
  const unopened = async () => {
    throw Object.assign(new Error("a secret is needed"), {
      name: "Unopened",
      outcome: "secret needed",
    });
  };
  const markup = await routed.draw(
    { ...api, answers: unopened },
    "/pods/alex-rivera/entries/e1",
  );
  assert.match(textOf(markup), /Open Alex Rivera's pod This pod is encrypted/);
  assert.match(markup, /autocomplete="current-password"/i);
});

test("while a step runs the page is busy, says what it is doing and has every button off, so no second step starts", async () => {
  const router = await routed.watched(
    { api: { ...api, setWorldDate: () => new Promise(() => undefined) } },
    "/pods/alex-rivera/",
  );
  const formData = new FormData();
  formData.set("intent", "world-date");
  formData.set("doing", "Setting the date…");
  formData.set("date", "2024-02-01");
  void router.navigate("/pods/alex-rivera/", { formMethod: "post", formData });
  assert.equal(body.dataset.state, "busy");
  assert.equal(routed.isBusy(), true);
  assert.equal(routed.sayingNow(), "Setting the date…");
  assert.deepEqual(
    buttons.map(({ disabled }) => disabled),
    [true, true],
  );
});

test("a read every screen needs that fails says the page went wrong, and why", async () => {
  await routed.watched(
    {
      api: {
        ...api,
        pods: async () => {
          throw new Error("the pods' folder is gone");
        },
      },
    },
    "/pods/alex-rivera/",
  );
  assert.equal(body.dataset.state, "error");
  assert.match(body.dataset.error ?? "", /the pods' folder is gone/);
});

test("a part that fills once the engine lands, whose read then fails for a reason that is no refusal, says the page went wrong, and why", async () => {
  let land: () => void = () => undefined;
  const engine = new Promise<void>((resolve) => (land = resolve));
  const series = { test: { code: "1", name: "Potassium" }, results: [] };
  const host = {
    api: {
      ...api,
      trend: async ({ named }: { named: boolean }) => {
        if (named) throw new Error("the tables are unreadable");
        return { labs: [], timeline: [], series };
      },
    },
    engine,
  };
  await routed.watched(host, "/pods/alex-rivera/trend?test=1");
  routed.warm(host);
  routed.ready();
  land();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(body.dataset.state, "error");
  assert.match(body.dataset.error ?? "", /the tables are unreadable/);
});
