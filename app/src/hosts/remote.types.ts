// Compile-only: an input the route's schema does not name fails `npm run typecheck`, as a misspelled field would in a
// screen. It is never imported.
import { remoteApi } from "./remote.ts";

const remote = remoteApi("http://localhost/");

// @ts-expect-error `pod` is the field, not `pood`
void remote.pod({ pood: "alex" });
// @ts-expect-error a field is typed as its schema says
void remote.pod({ pod: 1 });
void remote.pod({ pod: "alex" });

export {};
