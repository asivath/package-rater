import { test, expect } from "../baseFixtures";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe("Upload Package Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5173");
  });

  test("should upload a package from a file succesfully", async ({ page }) => {
    await page.click('role=button[name="Upload Package"]');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.resolve(__dirname, "..", "__files__", "is-sorted-main.zip"));

    await page.click('button:has-text("Submit")');

    await expect(page.locator("text=Package uploaded successfully")).toBeVisible({ timeout: 60000 });

    await page.locator("header").click({ force: true });
    await page.locator('role=button[name="Search"]').click();

    await page.locator('tr:has-text("is-sorted") button[aria-label="expand row"]').click();
    await expect(page.locator("text=is-sorted")).toBeVisible();
    await expect(page.locator("text=1.0.5")).toBeVisible();
  });

  test("should upload a package from a URL succesfully and on successive uploads should fail", async ({ page }) => {
    await page.click('role=button[name="Upload Package"]');
    const urlInput = page.locator('input[placeholder="Enter URL to GitHub or npm package"]');
    await urlInput.fill("https://www.npmjs.com/package/noop3");

    await page.click('button:has-text("Submit")');

    await expect(page.locator("text=Package uploaded successfully")).toBeVisible({ timeout: 60000 });

    await page.locator("header").click({ force: true });
    await page.locator('role=button[name="Search"]').click();

    await page.locator('tr:has-text("noop3") button[aria-label="expand row"]').click();
    await expect(page.locator("text=noop3")).toBeVisible();
    await expect(page.locator("text=1000.0.0")).toBeVisible();

    await page.click('role=button[name="Upload Package"]');
    await urlInput.fill("https://www.npmjs.com/package/noop3");

    await page.click('button:has-text("Submit")');

    await expect(page.locator("text=Package already exists")).toBeVisible({ timeout: 60000 });
  });
});
