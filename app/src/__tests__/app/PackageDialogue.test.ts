import { test, expect } from "@playwright/test";

test.describe("PackageDialog Component Tests", () => {
  test("should display details", async ({ page }) => {
    await page.goto("http://localhost:5173");
    const mockPackageName = "TestPackage";
    const mockVersion = "1.0.0";
    const mockId = "12345";
    const mockNetScore = 0.9;
    const searchBar = page.locator('input[placeholder="Type package name..."]');
    await searchBar.fill(mockPackageName);
    await page.route("**/packages", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            Name: mockPackageName,
            Version: mockVersion,
            ID: mockId,
            NetScore: mockNetScore
          }
        ])
      });
    });
    await page.locator('role=button[name="Search"]').click();
    const tableRow = page.locator(`text=${mockPackageName}`);
    await expect(tableRow).toBeVisible();
    await page.locator('role=button[name="expand row"]').click();

    await page.route("**/package/12345/cost", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ 12345: { totalCost: 2.3 } })
      });
    });
    await page.route("**/package/12345/rate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          NetScore: 1,
          NetScore_Latency: 1,
          BusFactor: 1,
          BusFactor_Latency: 1,
          Correctness: 1,
          Correctness_Latency: 1,
          RampUp: 1,
          RampUp_Latency: 1,
          ResponsiveMaintainer: 1,
          ResponsiveMaintainer_Latency: 1,
          License: 1,
          License_Latency: 1,
          GoodPinningPractice: 1,
          GoodPinningPracticeLatency: 1,
          PullRequest: 1,
          PullRequest_Latency: 1
        })
      });
    });
    await page.locator('role=button[name="Details"]').click();
    await expect(page.getByRole("heading", { name: "Package Details - TestPackage v1.0.0" })).toBeVisible();
    const dialog = page.locator("role=dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(`text=Version`)).toBeVisible();
    await expect(dialog.locator(`text=ID`)).toBeVisible();
    await expect(dialog.locator(`text=Name`)).toBeVisible();
    await expect(dialog.locator(`text=Uploaded With Content`)).toBeVisible();
    await expect(dialog.locator(`text=Standalone Cost`)).toBeVisible();
    await expect(dialog.locator(`text=Total Cost`)).toBeVisible();
  });
});
