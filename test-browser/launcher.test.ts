import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Browser, chromium, type Page } from "playwright";
import { TEST_DIRECTORY } from "cascade-runtime";
import { type Served, servePages } from "../try/build/serve.js";
import { settled, tiles, watched } from "./shown.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PAGES = join(ROOT, "build", "pages");
const LAUNCHER = "https://launch.smarthealthit.org";
const POD = "Launcher Patient";

/** What the starter's pages say, as far as this test reads it. */
const view = (await import(
  pathToFileURL(join(ROOT, "app", "said.ts")).href
)) as { hospitalName(name: string): string };

let served: Served;
let browser: Browser;

before(async () => {
  if (!existsSync(join(PAGES, "try", "index.html")))
    throw new Error(`${PAGES} holds no try/; run npm run build:try first`);
  served = await servePages(PAGES);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await served?.close();
});

/** Clicks the launcher's Sign in on the Find a hospital page; gives the popup once its login lists the patients. */
async function signIn(page: Page, name: string): Promise<Page> {
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.click(`.card:has(h2:text-is(${JSON.stringify(name)})) button`),
  ]);
  await popup.waitForSelector("select option:nth-child(2)", {
    state: "attached",
    timeout: 120_000,
  });
  assert.equal(new URL(popup.url()).origin, LAUNCHER);
  return popup;
}

/** Logs in on the launcher's page as its first patient, as a person picks one; gives the patient's ID and name. */
async function login(popup: Page): Promise<{ id: string; name: string }> {
  const [id = ""] = await popup.selectOption("select", { index: 1 });
  const name = await popup.$eval(
    "select",
    (select) =>
      (select as HTMLSelectElement).selectedOptions[0]?.textContent ?? "",
  );
  await popup.click('button:has-text("Login")');
  await popup.waitForSelector("#approve");
  return { id, name };
}

/** What the connection's box says; then the pod's page again, without the box. */
async function said(page: Page): Promise<string> {
  const text = (await page.textContent("#connection .card .detail")) ?? "";
  await page.goto(page.url().split("#")[0] ?? "");
  await settled(page);
  return text;
}

/**
 * try/ against launch.smarthealthit.org, a server this project did not write, over the network: nightly and by hand,
 * never when a change is proposed. Its patients are shared and edited by anyone, so these leaves say which patient came back and
 * that a record came in, never what the record holds.
 */
describe("The SMART Health IT launcher, in try/ · npm run test:launcher", () => {
  test("when a new pod's person signs in at the launcher", async (t) => {
    const row = TEST_DIRECTORY.find(
      ({ vendor }) => vendor === "smart-launcher",
    );
    assert.ok(row);
    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      /** The patient the launcher's token names, or why its body could not be read, from a copy kept as it passes. */
      let patient: Promise<string> = Promise.resolve("no token was asked for");
      await context.route("**/auth/token", async (route) => {
        const response = await route.fetch();
        patient = response.json().then(
          (body: { patient?: string }) => body.patient ?? "no patient",
          (error: unknown) => `an unread token: ${String(error)}`,
        );
        await route.fulfill({ response });
      });
      await page.goto(`${served.url}try/`);
      await settled(page);
      await page.click('a[href="#new-pod"]');
      await page.fill(
        '#new-pod input[name="person"]:not([type="hidden"])',
        POD,
      );
      await page.click('#new-pod button:has-text("Make the pod")');
      await settled(page);
      assert.equal(await page.textContent("main h1"), POD);
      await page.click('a:has-text("Find a hospital")');
      await settled(page);
      const listed = await page.$$eval(".card h2", (found) =>
        found.map((each) => each.textContent ?? ""),
      );
      await t.test(
        "offers every hospital of `TEST_DIRECTORY` on Find a hospital",
        () => {
          for (const { name } of TEST_DIRECTORY)
            assert.ok(
              listed.includes(view.hospitalName(name)),
              `${name} is not offered`,
            );
        },
      );

      // The launcher answers Deny on its own page and sends nothing back; the person closes the popup.
      const denied = await signIn(page, row.name);
      await login(denied);
      const deniedAt = new URL(denied.url()).origin;
      await denied.click("#deny");
      await denied.waitForURL(/\/auth\/authorize\?/);
      await denied.close();
      await settled(page);
      const afterDeny = await said(page);
      await page.click('a:has-text("Find a hospital")');
      await settled(page);

      const popup = await signIn(page, row.name);
      const chosen = await login(popup);
      const popupAt = new URL(popup.url()).origin;
      await t.test("opens the launcher's own pages in the popup", () => {
        assert.equal(deniedAt, LAUNCHER);
        assert.equal(popupAt, LAUNCHER);
      });
      await t.test(
        "says the popup was closed after the launcher's Deny",
        () => {
          assert.match(afterDeny, /closed/);
        },
      );
      await popup.click("#approve");
      await settled(page);
      const open = await page.isVisible("#connection");
      const about = /^This record is (.+?)'s[.,]/.exec(
        (await page.textContent("#connection .note")) ?? "",
      )?.[1];
      await t.test("opens the connection's box, naming a patient", () => {
        assert.ok(open, "the box is not open");
        assert.ok(about, "the box names no patient");
      });
      if (!open || about === undefined) return;
      await t.test(
        "receives a token that names the patient the person chose",
        async () => {
          assert.equal(await patient, chosen.id);
        },
      );
      await t.test("names that patient in the box", () => {
        assert.ok(
          chosen.name.includes(about.split(" ").at(-1) ?? ""),
          `the launcher's ${chosen.name} is not the record's ${about}`,
        );
      });

      const began = Date.now();
      await page.click("#connection button:has-text('Bring')");
      await settled(page, 300_000);
      console.log(`# brought in ${about}'s record in ${Date.now() - began} ms`);
      await t.test(
        'says "Brought in the record from" the launcher',
        async () => {
          assert.equal(
            await page.textContent("main .note"),
            `Brought in the record from ${view.hospitalName(row.name)}.`,
          );
        },
      );
      await t.test("shows a record on the pod's page", async () => {
        assert.ok(
          (await tiles(page)).size > 0,
          "the pod's page shows no record",
        );
      });
    } finally {
      await context.close();
    }
  });
});
