import { expect, test } from "@playwright/test";

test("Alex Rivera's pod draws its first tiles", async ({ page }) => {
  await page.goto("/pods/alex-rivera/");
  const body = page.locator("body");
  try {
    await expect(body).toHaveAttribute("data-state", /^(ready|error)$/);
    await expect(body).toHaveAttribute("data-state", "ready");
    await expect(page.locator(".tiles .tile").first()).toBeVisible();
  } catch (error) {
    console.log(
      `The page's last changes of state: ${await body.getAttribute("data-trace")}`,
    );
    throw error;
  }
});
