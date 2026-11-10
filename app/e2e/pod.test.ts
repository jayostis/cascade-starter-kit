import { expect, test } from "@playwright/test";

/**
 * The one browser test: it starts the app with `npm start` and opens a pod in Chromium. It waits for the page to say it is
 * ready (`body[data-state]`), never for text in `main`.
 */
test.describe("The app in a browser · npm run test:e2e", () => {
  test("when Alex Rivera's pod is opened", async ({ page }) => {
    await page.goto("/pods/alex-rivera/");
    const body = page.locator("body");
    try {
      await test.step("says it is ready", async () => {
        await expect(body).toHaveAttribute("data-state", /^(ready|error)$/);
        await expect(body).toHaveAttribute("data-state", "ready");
      });
      await test.step("draws its first tiles", async () => {
        await expect(page.locator(".tiles .tile").first()).toBeVisible();
      });
    } catch (error) {
      console.log(
        `The page says (because ${(await body.getAttribute("data-error")) ?? "it gave no reason"}). The page's last changes of state: ${await body.getAttribute("data-trace")}`,
      );
      throw error;
    }
  });
});
