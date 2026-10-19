import { rm } from "node:fs/promises";
import { tablesBeside } from "cascade-runtime";

/** Waits for the copy of the tables beside the pods in the folder, which goes on after a pod opens. */
export async function settled(pods: string): Promise<void> {
  await (await tablesBeside(pods)).start();
}

/**
 * Removes a folder, whatever is still being written into it. `start()` can return while a copy another call began
 * is still writing a version (its calls share the version's rows, not its write), and that write is the package's,
 * not the test's to await, so the removal goes again as Node's own retries do for ENOTEMPTY.
 */
export async function gone(folder: string): Promise<void> {
  await rm(folder, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}

/** Removes a folder of pods and the tables beside them once their copy has ended. */
export async function removed(pods: string): Promise<void> {
  await settled(pods);
  await gone(pods);
}
