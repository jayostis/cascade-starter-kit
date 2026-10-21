// The app's entry: the host its build is for, PodApi over HTTP on Node or in the page in a browser, and the app's
// router under the base it was built for, drawn once it has read the first screen. A build for one host carries
// nothing of the other's.
import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { BASE } from "./address.tsx";
import { HostProvider, type Host } from "./api.tsx";
import { routes } from "./App.tsx";
import { failed, ready, watch } from "./doing.ts";
import { warm } from "./engine.ts";
import "./style.css";

const root = document.getElementById("root") ?? document.body;
if (location.pathname === `${BASE}index.html`)
  history.replaceState(history.state, "", `${BASE}${location.hash}`);
const underBase =
  location.pathname.startsWith(BASE) ||
  location.pathname === BASE.replace(/\/$/, "");

/** Settles once `router` has read its first screen. */
const initialized = (router: ReturnType<typeof createBrowserRouter>) =>
  new Promise<void>((resolve) => {
    if (router.state.initialized) return resolve();
    const stop = router.subscribe(({ initialized }) => {
      if (!initialized) return;
      stop();
      resolve();
    });
  });

if (!underBase) {
  const drawn = createRoot(root);
  flushSync(() =>
    drawn.render(
      <main>
        <h1>Not found</h1>
        <p>
          There is no page at this address. <a href={BASE}>Open the app</a>.
        </p>
      </main>,
    ),
  );
  ready();
} else {
  const hosted: Promise<{ host: Host }> =
    import.meta.env.MODE === "browser"
      ? import("./hosts/browser.ts")
      : import("./hosts/http.ts");
  hosted
    .then(async ({ host }) => {
      const router = createBrowserRouter(routes(host), {
        basename: BASE.replace(/\/$/, ""),
      });
      watch(router);
      warm(host);
      await initialized(router);
      createRoot(root).render(
        <StrictMode>
          <HostProvider value={host}>
            <RouterProvider router={router} useTransitions={false} />
          </HostProvider>
        </StrictMode>,
      );
    })
    .catch((error: unknown) => {
      const said = error instanceof Error ? error.message : String(error);
      root.textContent = `The app could not start: ${said}`;
      failed(`the app could not start: ${said}`);
    });
}
