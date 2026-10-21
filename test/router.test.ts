import assert from "node:assert/strict";
import { test } from "node:test";
import { screens, textOf } from "./render.js";

/** The app's routes over a host whose PodApi is `api`, in a memory router, drawn once it has settled. */
interface Routed {
  draw(
    api: object,
    at: string,
    posted?: Readonly<Record<string, string>>,
  ): Promise<string>;
}

const routed = await screens<Routed>(`
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "./App.tsx";
import { HostProvider } from "./api.tsx";

const idle = (router) =>
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

export async function draw(api, at, posted) {
  const host = {
    api,
    about: { name: "Cascade", version: "0", runtime: "0" },
    samples: [],
    people: async () => [],
    firstVisit: async () => undefined,
    engine: () => new Promise(() => undefined),
    tables: async () => undefined,
    reads: { list: async () => [], run: async () => ({}) },
  };
  const router = createMemoryRouter(routes(host), { initialEntries: [at] });
  await idle(router);
  if (posted !== undefined) {
    const formData = new FormData();
    for (const [name, value] of Object.entries(posted)) formData.set(name, value);
    await router.navigate(at, { formMethod: "post", formData });
    await idle(router);
  }
  return renderToStaticMarkup(
    <HostProvider value={host}>
      <RouterProvider router={router} />
    </HostProvider>,
  );
}
`);

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

test("a screen is drawn from its route's loader, and a step its action refuses is drawn as Not done with the rules' sentence, never as gone wrong", async () => {
  const main = (markup: string) =>
    textOf(/<main\b[^>]*>([\s\S]*)<\/main>/.exec(markup)?.[1] ?? "");
  const pod = main(await routed.draw(api, "/pods/alex-rivera/"));
  assert.match(pod, /^Alex Rivera Nothing here yet\./);
  const set = main(
    await routed.draw(api, "/pods/alex-rivera/", {
      intent: "world-date",
      date: "soon",
    }),
  );
  assert.match(set, /^Not done "soon" is not a date\.$/);
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
