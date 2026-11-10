import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

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

const FROM = new URL("https://app.example/cascade/pods/alex-rivera/");
const BASE = "/cascade/";
const LINK = { target: "", download: false };

/** Each address with whether the app takes it in place, and why, by the kind of case it is. */
const ADDRESSES = [
  ["screen", "/cascade/", true, "the home screen"],
  ["screen", "/cascade/pods/priya-natarajan/", true, "a pod"],
  [
    "screen",
    "/cascade/pods/alex-rivera/entries/a.b",
    true,
    "an entry with a dot",
  ],
  ["screen", "/cascade/tables/c1a6/?q=141&page=2", true, "a table's search"],
  ["screen", "/cascade/encrypted-pods/grace-hopper", true, "the six words"],
  ["served", "/cascade/signed-in.html", false, "a file the app serves"],
  ["served", "/cascade/demo-brands.json", false, "a data file"],
  ["served", "/cascade/api/pods", false, "a route the server answers"],
  ["served", "/cascade/callback?code=x", false, "the hospital's way back"],
  [
    "lookalike",
    "/cascade/podcast/",
    false,
    "a path that only starts like a screen",
  ],
  ["outside", "/elsewhere/pods/x/", false, "outside the base"],
  [
    "outside",
    "https://hospital.example/cascade/pods/x/",
    false,
    "another site",
  ],
] as const;

const moves = (kind: (typeof ADDRESSES)[number][0]) =>
  ADDRESSES.filter((row) => row[0] === kind).map(([, href, expected, why]) => ({
    actual: movesInPlace(LINK, new URL(href, FROM), FROM, BASE),
    expected,
    why,
  }));

const POD = new URL("/cascade/pods/priya-natarajan/", FROM);

/**
 * A click on a link to one of the app's screens redraws the page in place; every other link is left to the browser.
 * `movesInPlace` decides which, so a file, a download or the hospital's way back is never swallowed.
 */
describe("Moving between screens without loading the page again · movesInPlace()", () => {
  describe("movesInPlace(link, to, from, base)", () => {
    it("returns true for the address of a screen under the base", () => {
      for (const { actual, expected, why } of moves("screen"))
        assert.equal(actual, expected, why);
    });

    it("returns false for a file the app serves and for a route the server answers", () => {
      for (const { actual, expected, why } of moves("served"))
        assert.equal(actual, expected, why);
    });

    it("returns false for a path that only starts like a screen's", () => {
      for (const { actual, expected, why } of moves("lookalike"))
        assert.equal(actual, expected, why);
    });

    it("returns false for an address outside the base, and for one on another site", () => {
      for (const { actual, expected, why } of moves("outside"))
        assert.equal(actual, expected, why);
    });

    it("returns false for a download link, and for a link that opens another window", () => {
      assert.equal(
        movesInPlace({ ...LINK, download: true }, POD, FROM, BASE),
        false,
        "a download",
      );
      assert.equal(
        movesInPlace({ ...LINK, target: "_blank" }, POD, FROM, BASE),
        false,
        "another window",
      );
    });

    it("returns true for a link whose `target` is this window", () => {
      assert.equal(
        movesInPlace({ ...LINK, target: "_self" }, POD, FROM, BASE),
        true,
      );
    });
  });
});

describe("Screens App.tsx routes, against the addresses the app takes in place", () => {
  it("finds every path `App.tsx` routes to be one `movesInPlace` takes", () => {
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
});
