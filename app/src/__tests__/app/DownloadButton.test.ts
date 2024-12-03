import { test, expect } from "../baseFixtures";

test.describe("DownloadButton", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5173");

    // Mocking the package list API response
    await page.route("**/packages", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            Name: "TestPackage",
            Version: "1.0.0",
            ID: "12345",
            NetScore: 0.9,
            UploadedWithContent: true
          }
        ])
      });
    });

    await page.locator('role=button[name="Search"]').click();
  });

  test("should download a package when clicking the Download button", async ({ page }) => {
    const packageName = "TestPackage";
    const downloadPromise = page.waitForEvent("download");
    const packageRow = page.locator(`text=${packageName}`);

    await expect(packageRow).toBeVisible();

    await packageRow.click();

    const downloadButton = page.locator('[data-testid="DownloadIcon"]');

    await page.route("**/package/12345", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          metadata: {
            Name: "TestPackage",
            Version: "1.0.0",
            ID: "12345"
          },
          data: {
            Content: "YQ=="
          }
        })
      });
    });

    await downloadButton.click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("TestPackage-1.0.0.zip");
  });
});
