import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
import { settled, tiles, watched } from "./shown.js";

/** Pages' deploy, and the ten minutes it caches a page for. */
const DEPLOY = 15 * 60_000;
const BETWEEN = 20_000;

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "")
    throw new Error(`set ${name} to run the live check`);
  return value;
}

/**
 * The site GitHub Pages serves, as a person reaches it, once the deploy of a commit on main is served. It runs after the
 * `pages` job, never when a change is proposed.
 */
describe("The deployed site · PAGES_URL, COMMIT", () => {
  test("when the commit's deploy is served", async (t) => {
    const site = required("PAGES_URL").replace(/\/?$/, "/");
    const commit = required("COMMIT").slice(0, 12);

    const began = Date.now();
    let built: string;
    for (;;) {
      const response = await fetch(
        `${site}try/index.html?commit=${commit}&at=${Date.now()}`,
        { cache: "no-store" },
      ).catch(() => undefined);
      const page = response?.ok === true ? await response.text() : "";
      built = /data-version="([^"]*)"/.exec(page)?.[1] ?? "";
      if (built.startsWith(commit) || Date.now() - began > DEPLOY) break;
      await sleep(BETWEEN);
    }
    await t.test(
      "serves try/ built from the commit within fifteen minutes",
      () => {
        assert.ok(
          built.startsWith(commit),
          `${site}try/ was not built from ${commit} within ${DEPLOY / 60_000} minutes; it was built from ${built || "nothing"}`,
        );
      },
    );
    if (!built.startsWith(commit)) return;
    console.log(
      `waited ${Math.round((Date.now() - began) / 1000)}s for the deploy of ${commit}`,
    );

    const browser = await chromium.launch();
    try {
      const page = watched(await browser.newPage());
      await page.goto(`${site}?at=${Date.now()}`);
      await page.waitForURL((url) => url.href.startsWith(`${site}try/`));
      await settled(page);
      await t.test(
        "sends a visitor at the site's root to try/ of the commit",
        async () => {
          assert.ok(
            (
              (await page.getAttribute("body", "data-version")) ?? ""
            ).startsWith(commit),
            `${site} redirected to a try/ that was not built from ${commit}`,
          );
        },
      );
      await t.test("opens try/ with Alex Rivera's pod", async () => {
        assert.equal(
          await page.textContent("main h1"),
          "Alex Rivera",
          `${site} does not open try/ with Alex's pod`,
        );
      });
      await t.test("shows Alex Rivera's allergies", async () => {
        assert.ok(
          ((await tiles(page)).get("Allergies") ?? 0) > 0,
          `${site}try/ shows Alex with no allergy`,
        );
      });
    } finally {
      await browser.close();
    }
  });
});
