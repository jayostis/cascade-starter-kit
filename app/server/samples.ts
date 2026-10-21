// What a sample pod carries for the browser target's first paint: the names its page asks the tables for, kept with
// it, so a first visit draws them before the engine. `npm run browser` and try/'s site build make the samples with it.
import type { Pod, Tables } from "cascade-runtime/published";
import { podApi, type PodHost } from "../pod-api.ts";

const SAMPLE = "pod";

/**
 * What the pod's page asks the tables of it, asked as the page asks it, through PodApi; a lookup PodApi swallows into
 * `unsaid` fails the build, each failure named once `said` has settled.
 */
export async function looks(pod: Pod, tables: Tables): Promise<void> {
  const failed: unknown[] = [];
  const host: PodHost = {
    pods: {
      names: async () => [SAMPLE],
      title: async () => undefined,
      open: async () => pod,
      remove: async () => undefined,
    },
    tables: async () => tables,
    checkTables: async () => [],
    opensEncrypted: true,
    unsaid: (_kind, error) => {
      failed.push(error);
    },
  };
  const api = podApi(host);
  await api.said({ pod: SAMPLE });
  if (failed.length > 0)
    throw new AggregateError(
      failed,
      "the samples' first-paint lookups could not be recorded",
    );
}
