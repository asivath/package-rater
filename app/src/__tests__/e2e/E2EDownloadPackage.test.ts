import { test, expect } from "../baseFixtures";
import path from "path";
import { fileURLToPath } from "url";

test.describe("Download tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5173");
  });

  test("should upload a package from a URL succesfully and should download the same file", async ({ page }) => {
    await page.click('role=button[name="Upload Package"]');
    const urlInput = page.locator('input[placeholder="Enter URL to GitHub or npm package"]');
    await urlInput.fill("https://www.npmjs.com/package/tiny-invariant");

    await page.click('button:has-text("Submit")');

    await expect(page.locator("text=Package uploaded successfully")).toBeVisible({ timeout: 60000 });

    await page.locator("header").click({ force: true });
    await page.locator('role=button[name="Search"]').click();

    await page.locator('tr:has-text("noop3") button[aria-label="expand row"]').click();
    await expect(page.locator('text=noop3')).toBeVisible();
    await expect(page.locator('text=1000.0.0')).toBeVisible();

    await page.locator('role=button[name="Download"]').click();
  });
});
