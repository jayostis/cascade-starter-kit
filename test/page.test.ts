import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/** What the test reads of `addresses.ts`. */
interface Addressed {
  movesInPlace(
    link: { target: string; download: boolean },
    to: URL,
    from: URL,
    base: string,
  ): boolean;
}

const { movesInPlace } = (await import(
  new URL("../../app/addresses.ts", import.meta.url).href
)) as Addressed;

test("a click moves the app in place to a screen under its base, and leaves a download, another window, another site, a file and a route the server answers to the browser", () => {
  const from = new URL("https://app.example/cascade/pods/alex-rivera/");
  const BASE = "/cascade/";
  const link = { target: "", download: false };
  for (const [href, moves, why] of [
    ["/cascade/", true, "the home screen"],
    ["/cascade/pods/priya-natarajan/", true, "a pod"],
    ["/cascade/pods/alex-rivera/entries/a.b", true, "an entry with a dot"],
    ["/cascade/tables/c1a6/?q=141&page=2", true, "a table's search"],
    ["/cascade/encrypted-pods/grace-hopper", true, "the six words"],
    ["/cascade/signed-in.html", false, "a file the app serves"],
    ["/cascade/demo-brands.json", false, "a data file"],
    ["/cascade/api/pods", false, "a route the server answers"],
    ["/cascade/callback?code=x", false, "the hospital's way back"],
    ["/cascade/podcast/", false, "a path that only starts like a screen"],
    ["/elsewhere/pods/x/", false, "outside the base"],
    ["https://hospital.example/cascade/pods/x/", false, "another site"],
  ] as const)
    assert.equal(
      movesInPlace(link, new URL(href, from), from, BASE),
      moves,
      why,
    );
  const pod = new URL("/cascade/pods/priya-natarajan/", from);
  assert.equal(
    movesInPlace({ ...link, download: true }, pod, from, BASE),
    false,
    "a download",
  );
  assert.equal(
    movesInPlace({ ...link, target: "_blank" }, pod, from, BASE),
    false,
    "another window",
  );
  assert.equal(
    movesInPlace({ ...link, target: "_self" }, pod, from, BASE),
    true,
    "this window",
  );
});

test("every screen path App.tsx routes is one the app takes in place, so that a screen added there cannot be left to the browser", () => {
  const routed = [
    ...readFileSync(
      new URL("../../app/src/App.tsx", import.meta.url),
      "utf8",
    ).matchAll(/\b(?:leaf\(|path: )"([^"]*)"/g),
  ].map(([, path = ""]) => path);
  assert.ok(routed.length > 1, "found the routes");
  const from = new URL("https://app.example/pods/x/");
  for (const path of routed.filter((each) => each !== "*"))
    assert.equal(
      movesInPlace(
        { target: "", download: false },
        new URL(path.replace(/:\w+\??/g, "x"), from.origin),
        from,
        "/",
      ),
      true,
      `${path} is a route the browser would follow, not the app: add it to SCREENS in addresses.ts`,
    );
});
