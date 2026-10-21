// The app's entry: the host its build is for, PodApi over HTTP on Node or in the page in a browser, and the app drawn
// under the base it was built for. A build for one host carries nothing of the other's.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { BASE } from "./address.tsx";
import { HostProvider, type Host } from "./api.tsx";
import { App } from "./App.tsx";
import { failed } from "./doing.ts";
import "./style.css";

const hosted: Promise<{ host: Host }> =
  import.meta.env.MODE === "browser"
    ? import("./hosts/browser.ts")
    : import("./hosts/http.ts");

const root = document.getElementById("root") ?? document.body;

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
    root.textContent = `The app could not start: ${error instanceof Error ? error.message : String(error)}`;
    failed();
  },
);
