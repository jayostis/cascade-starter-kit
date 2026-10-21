// The engine, which says what the tables say of a pod's codes: warmed in the background once the first screen is drawn,
// as `data-engine` on the body says, then the tables kept up to date (`data-tables`). A loader that needs it while it
// warms gives the screen what it has now, and the rest as a promise the screen draws as still filling.
import type { Host } from "./api.tsx";
import { failed, firstReady } from "./doing.ts";

let engine: "waiting" | "ready" | "failed" = "waiting";
let land: () => void = () => undefined;
const landed = new Promise<void>((resolve) => {
  land = resolve;
});

/** Whether the engine is still warming. */
export const warming = () => engine === "waiting";

/** Warms the host's engine once the first screen is drawn. */
export function warm(host: Host) {
  void firstReady
    .then(() => host.engine())
    .then(
      () => {
        document.body.dataset.engine = "ready";
        engine = "ready";
        land();
        host.tables().then(
          () => {
            document.body.dataset.tables = "ready";
          },
          () => undefined,
        );
      },
      () => {
        engine = "failed";
        land();
      },
    );
}

/**
 * What `read` gives once the engine has landed, `unsaid` when it cannot say: a loader awaits it unless the engine is
 * still `warming`, and then hands the promise to the screen. A read the rules refuse is `unsaid` too; one that fails
 * for any other reason says the page went wrong, `what` naming what could not be read, and the part is drawn unsaid.
 */
export const whenNamed = <T>(
  read: () => Promise<T>,
  unsaid: T,
  what: string,
): Promise<T> =>
  landed.then(async () => {
    if (engine !== "ready") return unsaid;
    try {
      return await read();
    } catch (error) {
      if (!(error instanceof Error && error.name === "Refusal"))
        failed(
          `${what} could not be read: ${error instanceof Error ? error.message : String(error)}`,
        );
      return unsaid;
    }
  });
