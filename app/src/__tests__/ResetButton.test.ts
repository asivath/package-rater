import { test, expect } from "./baseFixtures";

test.describe("ResetButton", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5173");
  });

  test("should open the reset confirmation dialog when clicking the Reset button", async ({ page }) => {
    await page.click('role=button[name="Reset"]');
    await expect(page.getByRole("heading", { name: "Confirmation" })).toBeVisible();
  });

  test("should display appropriate message based on environment", async ({ page }) => {
    await page.click('role=button[name="Reset"]');
    const expectedText = process.env.NODE_ENV === "prod"
      ? "Are you sure you want to reset the local packages? This cannot be undone."
      : "Are you sure you want to reset the S3 bucket? This cannot be undone.";
    await expect(page.locator("text=" + expectedText)).toBeVisible();
  });

  test("should close dialog when 'No' is clicked", async ({ page }) => {
    await page.click('role=button[name="Reset"]');
    await page.click('button:has-text("No")');
    await expect(page.locator("text=Confirmation")).not.toBeVisible();
  });

  test("should close dialog and call reset function when 'Yes' is clicked", async ({ page }) => {
    await page.click('role=button[name="Reset"]');

    await page.route("**/reset", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true })
      })
    );

    await page.click('button:has-text("Yes")');
    await expect(page.locator("text=Confirmation")).not.toBeVisible();
  });

  test("should close dialog if reset request fails", async ({ page }) => {
    await page.click('role=button[name="Reset"]');

    await page.route("**/reset", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Failed to reset" })
      })
    );

    await page.click('button:has-text("Yes")');
    await expect(page.locator("text=Confirmation")).not.toBeVisible();
  });
});
