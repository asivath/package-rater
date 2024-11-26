import { test, expect } from "./baseFixtures";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mockContentPackageName = "ContentPackage";
const mockURLPackageName = "URLPackage";
const mockVersion = "1.0.0";
const mockContentId = "12345";
const mockURLId = "54321";
const mockNetScore = 0.9;

test.describe("UploadVersion", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5173");

    const searchBar = page.locator('input[placeholder="Type package name..."]');
    await searchBar.fill(mockURLPackageName);

    await page.route("**/packages", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            Name: mockURLPackageName,
            Version: mockVersion,
            ID: mockURLId,
            NetScore: mockNetScore
          },
          {
            Name: mockContentPackageName,
            Version: mockVersion,
            ID: mockContentId,
            NetScore: mockNetScore
          }
        ])
      });
    });

    await page.route("**/content/URLPackage", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          uploadedWithContent: false
        })
      });
    });

    await page.route("**/content/ContentPackage", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          uploadedWithContent: true
        })
      });
    });

    await page.locator('role=button[name="Search"]').click();
  });

  test("should open the upload dialog when clicking the Upload Package button", async ({ page }) => {
    const uploadButton = page.locator('[data-testid="DriveFolderUploadIcon"]');
    uploadButton.click();
    await expect(page.getByRole("heading", { name: `Upload New ${mockContentPackageName} Version` })).toBeVisible();

    await page.click('button:has-text("Cancel")');

    const uploadButton2 = page.locator('[data-testid="CloudUploadIcon"]');
    uploadButton2.click();
    await expect(page.getByRole("heading", { name: `Upload New ${mockURLPackageName} Version` })).toBeVisible();
  });

  test("should show error when submitting without a file or URL", async ({ page }) => {
    await page.click('[data-testid="DriveFolderUploadIcon"]');
    await page.click('button:has-text("Submit")');
    await expect(page.locator("text=Please select a package")).toBeVisible();
  });

  test("should submit successfully with a file upload", async ({ page }) => {
    await page.click('[data-testid="DriveFolderUploadIcon"]');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, "__files__", "test.zip"));

    await page.route(`**/package/${mockContentId}`, async (route) => {
      const request = route.request();
      const postData = await request.postDataJSON();

      expect(postData.data).not.toHaveProperty("URL");
      expect(postData.data).toHaveProperty("Content");
      expect(postData.data.Content).toMatch(/^.+$/);
      expect(postData.data).toHaveProperty("debloat", false);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true })
      });
    });

    await page.click('button:has-text("Submit")');
    await expect(page.locator("text=Version uploaded successfully")).toBeVisible();
  });

  test("should submit successfully with a URL and debload set to true", async ({ page }) => {
    await page.click('[data-testid="CloudUploadIcon"]');
    await page.fill('input[placeholder="Enter URL to GitHub or npm package"]', "https://github.com/sample/repo");
    const debloatCheckbox = page.locator('input[name="debloat"]');
    await debloatCheckbox.check();

    await page.route(`**/package/${mockURLId}`, async (route) => {
      const request = route.request();
      const postData = await request.postDataJSON();

      expect(postData.data).not.toHaveProperty("Content");
      expect(postData.data).toHaveProperty("URL", "https://github.com/sample/repo");
      expect(postData.data).toHaveProperty("debloat", true);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true })
      });
    });

    await page.click('button:has-text("Submit")');
    await expect(page.locator("text=Version uploaded successfully")).toBeVisible();
  });

  const errorScenarios = [
    { status: 409, message: "Package already exists" },
    { status: 424, message: "Package is not uploaded due to the disqualified rating" },
    { status: 500, message: "Error saving the package" },
    { status: 501, message: "An unknown error occurred" }
  ];
  errorScenarios.forEach(({ status, message }) => {
    test(`should show correct error message when API responds with ${status}`, async ({ page }) => {
      await page.click('[data-testid="CloudUploadIcon"]');
      await page.fill('input[placeholder="Enter URL to GitHub or npm package"]', "https://github.com/sample/repo");

      await page.route(`**/package/${mockURLId}`, (route) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ error: message })
        })
      );

      await page.click('button:has-text("Submit")');

      await expect(page.locator(`text=${message}`)).toBeVisible();
    });
  });

  test("should handle debloat checkbox", async ({ page }) => {
    await page.click('[data-testid="CloudUploadIcon"]');

    const debloatCheckbox = page.locator('input[name="debloat"]');
    await debloatCheckbox.check();
    expect(await debloatCheckbox.isChecked()).toBe(true);
    await debloatCheckbox.uncheck();
    expect(await debloatCheckbox.isChecked()).toBe(false);
  });

  test("should reset form when dialog is closed", async ({ page }) => {
    await page.click('[data-testid="CloudUploadIcon"]');

    await page.fill('input[placeholder="Enter URL to GitHub or npm package"]', "https://github.com/sample/repo");
    const debloatCheckbox = page.locator('input[name="debloat"]');
    await debloatCheckbox.check();

    await page.click('button:has-text("Cancel")');

    await page.click('role=button[name="Upload Package"]');
    expect(await page.locator('input[placeholder="Enter URL to GitHub or npm package"]').inputValue()).toBe("");
    expect(await debloatCheckbox.isChecked()).toBe(false);
  });

  test("should clear the selected file when Clear File button is clicked", async ({ page }) => {
    await page.click('[data-testid="DriveFolderUploadIcon"]');

    const fileInput = page.locator('input[type="file"]');
    const testFilePath = path.join(__dirname, "__files__", "test.zip");
    await fileInput.setInputFiles(testFilePath);
    await expect(page.locator("text=Selected file: test.zip")).toBeVisible();

    await page.click('button:has-text("Clear File")');

    await expect(page.locator("text=Selected file:")).not.toBeVisible();

    const fileInputValue = await fileInput.evaluate((input: HTMLInputElement) => input.value);
    expect(fileInputValue).toBe("");
  });
});
