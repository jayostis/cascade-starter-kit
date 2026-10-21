// Compile-only: an input the route's schema does not name fails `npm run typecheck`, as a misspelled field would in a
// screen, and so does reading an output as PodApi does not give it. It is never imported.
import { remoteApi } from "./remote.ts";

const remote = remoteApi("http://localhost/");

// @ts-expect-error `pod` is the field, not `pood`
void remote.pod({ pood: "alex" });
// @ts-expect-error a field is typed as its schema says
void remote.pod({ pod: 1 });
void remote.pod({ pod: "alex" });

void (async () => {
  const pod = await remote.pod({ pod: "alex" });
  const encrypted: boolean = pod.encrypted;
  // @ts-expect-error a pod's answer has no `pods`: that is the list's
  void pod.pods;
  // @ts-expect-error a title is a string
  const title: number = pod.title;
  return [encrypted, title];
})();

export {};
