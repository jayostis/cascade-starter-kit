// The app's entry: the host its build is for, PodApi over HTTP on Node or in the page in a browser, and the app drawn
// under the base it was built for. A build for one host carries nothing of the other's.
import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { BASE } from "./address.tsx";
import { HostProvider, type Host } from "./api.tsx";
import { App } from "./App.tsx";
import { failed, ready } from "./doing.ts";
import "./style.css";

const root = document.getElementById("root") ?? document.body;
if (location.pathname === `${BASE}index.html`)
  history.replaceState(history.state, "", `${BASE}${location.hash}`);
const underBase =
  location.pathname.startsWith(BASE) ||
  location.pathname === BASE.replace(/\/$/, "");

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
  hosted.then(
    ({ host }) =>
      createRoot(root).render(
        <StrictMode>
          <HostProvider value={host}>
            <BrowserRouter basename={BASE.replace(/\/$/, "")}>
              <App />
            </BrowserRouter>
          </HostProvider>
        </StrictMode>,
      ),
    (error: unknown) => {
      const said = error instanceof Error ? error.message : String(error);
      root.textContent = `The app could not start: ${said}`;
      failed(`the app could not start: ${said}`);
    },
  );
}
