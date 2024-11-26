import { test, expect } from "../baseFixtures";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe("UploadPackageForm", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5173");
  });

  test("should open the upload dialog when clicking the Upload Package button", async ({ page }) => {
    await page.click('role=button[name="Upload Package"]');
    await expect(page.getByRole("heading", { name: "Upload Package" })).toBeVisible();
  });

  test("should show error when submitting without a file or URL", async ({ page }) => {
    await page.click('role=button[name="Upload Package"]');
    await page.click('button:has-text("Submit")');
    await expect(page.locator("text=Please select a file or enter a URL")).toBeVisible();
  });

  test("should show error when both file and URL are provided", async ({ page }) => {
    await page.click('role=button[name="Upload Package"]');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.resolve(__dirname, "..", "__files__", "test.zip"));

    await page.fill('input[placeholder="Enter URL to GitHub or npm package"]', "https://github.com/sample/repo");

    await page.click('button:has-text("Submit")');
    await expect(page.locator("text=Provide either a file or a URL, not both")).toBeVisible();
  });

  test("should submit successfully with a file upload", async ({ page }) => {
    await page.click('role=button[name="Upload Package"]');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.resolve(__dirname, "..", "__files__", "test.zip"));

    await page.route("**/package", async (route) => {
      const request = route.request();
      const postData = await request.postDataJSON();

      expect(postData).not.toHaveProperty("URL");
      expect(postData).toHaveProperty("Content");
      expect(postData.Content).toMatch(/^.+$/);
      expect(postData).toHaveProperty("debloat", false);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true })
      });
    });

    await page.click('button:has-text("Submit")');
    await expect(page.locator("text=Package uploaded successfully")).toBeVisible();
  });

  test("should submit successfully with a URL and debload set to true", async ({ page }) => {
    await page.click('role=button[name="Upload Package"]');
    await page.fill('input[placeholder="Enter URL to GitHub or npm package"]', "https://github.com/sample/repo");
    const debloatCheckbox = page.locator('input[name="debloat"]');
    await debloatCheckbox.check();

    await page.route("**/package", async (route) => {
      const request = route.request();
      const postData = await request.postDataJSON();

      expect(postData).not.toHaveProperty("Content");
      expect(postData).toHaveProperty("URL", "https://github.com/sample/repo");
      expect(postData).toHaveProperty("debloat", true);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true })
      });
    });

    await page.click('button:has-text("Submit")');
    await expect(page.locator("text=Package uploaded successfully")).toBeVisible();
  });

  test("should display packages in the table when fetched and show details when expanded and show correct version button icons", async ({
    page
  }) => {
    await page.goto("http://localhost:5173");

    const contentPackageName = "TestPackage";
    const URLPackageName = "URLPackage";
    const mockVersion = "1.0.0";
    const contentMockId = "12345";
    const URLMockId = "54321";
    const mockNetScore = 0.9;

    const searchBar = page.locator('input[placeholder="Type package name..."]');
    await searchBar.fill("");

    await page.route("**/packages", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            Name: contentPackageName,
            Version: mockVersion,
            ID: contentMockId,
            NetScore: mockNetScore,
            UploadedWithContent: true
          },
          {
            Name: URLPackageName,
            Version: mockVersion,
            ID: URLMockId,
            NetScore: mockNetScore,
            UploadedWithContent: false
          }
        ])
      });
    });

    await page.locator('role=button[name="Search"]').click();

    const tableRow = page.locator(`text=${contentPackageName}`);
    await expect(tableRow).toBeVisible();

    const newVersion = tableRow.locator('[data-testid="DriveFolderUploadIcon"]');
    await newVersion.click();

    page.locator(`text=Upload ${contentPackageName} Version`).isVisible();
  });

  test("should display packages in the table when fetched and show details when expanded and show only file using content", async ({
    page
  }) => {
    await page.goto("http://localhost:5173");

    const contentPackageName = "TestPackage";
    const URLPackageName = "URLPackage";
    const mockVersion = "1.0.0";
    const contentMockId = "12345";
    const URLMockId = "54321";
    const mockNetScore = 0.9;

    const searchBar = page.locator('input[placeholder="Type package name..."]');
    await searchBar.fill("");

    await page.route("**/packages", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            Name: contentPackageName,
            Version: mockVersion,
            ID: contentMockId,
            NetScore: mockNetScore,
            UploadedWithContent: true
          },
          {
            Name: URLPackageName,
            Version: mockVersion,
            ID: URLMockId,
            NetScore: mockNetScore,
            UploadedWithContent: false
          }
        ])
      });
    });

    await page.locator('role=button[name="Search"]').click();

    const tableRow = page.locator(`text=${contentPackageName}`);
    await expect(tableRow).toBeVisible();

    const newVersion = tableRow.locator('[data-testid="DriveFolderUploadIcon"]');
    await newVersion.click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, "__files__", "test.zip"));

    await page.route("**/package", async (route) => {
      const request = route.request();
      const postData = await request.postDataJSON();

      expect(postData).not.toHaveProperty("URL");
      expect(postData).toHaveProperty("Content");
      expect(postData.Content).toMatch(/^.+$/);
      expect(postData).toHaveProperty("debloat", false);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true })
      });
    });

    await page.click('button:has-text("Submit")');

    await expect(page.locator("text=test.zip")).toBeVisible();
  });

  test("should display packages in the table when fetched and show details when expanded and url upload version works", async ({
    page
  }) => {
    await page.goto("http://localhost:5173");

    const contentPackageName = "TestPackage";
    const URLPackageName = "URLPackage";
    const mockVersion = "1.0.0";
    const contentMockId = "12345";
    const URLMockId = "54321";
    const mockNetScore = 0.9;

    const searchBar = page.locator('input[placeholder="Type package name..."]');
    await searchBar.fill("");

    await page.route("**/packages", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            Name: contentPackageName,
            Version: mockVersion,
            ID: contentMockId,
            NetScore: mockNetScore,
            UploadedWithContent: true
          },
          {
            Name: URLPackageName,
            Version: mockVersion,
            ID: URLMockId,
            NetScore: mockNetScore,
            UploadedWithContent: false
          }
        ])
      });
    });

    await page.locator('role=button[name="Search"]').click();

    const tableRow = page.locator(`text=${URLPackageName}`);
    await expect(tableRow).toBeVisible();

    const newVersion = tableRow.locator('[data-testid="CloudUploadIcon"]');
    await newVersion.click();

    await page.fill('input[placeholder="Enter URL to GitHub or npm package"]', "https://github.com/sample/repo");
    const debloatCheckbox = page.locator('input[name="debloat"]');
    await debloatCheckbox.check();

    await page.route("**/package", async (route) => {
      const request = route.request();
      const postData = await request.postDataJSON();

      expect(postData).not.toHaveProperty("Content");
      expect(postData).toHaveProperty("URL", "https://github.com/sample/repo");
      expect(postData).toHaveProperty("debloat", true);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true })
      });
    });

    await page.click('button:has-text("Submit")');
  });

  const errorScenarios = [
    { status: 409, message: "Package already exists" },
    { status: 424, message: "Package is not uploaded due to the disqualified rating" },
    { status: 500, message: "Error saving the package" },
    { status: 501, message: "An unknown error occurred" }
  ];
  errorScenarios.forEach(({ status, message }) => {
    test(`should show correct error message when API responds with ${status}`, async ({ page }) => {
      await page.click('role=button[name="Upload Package"]');
      await page.fill('input[placeholder="Enter URL to GitHub or npm package"]', "https://github.com/sample/repo");

      await page.route("**/package", (route) =>
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
    await page.click('role=button[name="Upload Package"]');

    const debloatCheckbox = page.locator('input[name="debloat"]');
    await debloatCheckbox.check();
    expect(await debloatCheckbox.isChecked()).toBe(true);
    await debloatCheckbox.uncheck();
    expect(await debloatCheckbox.isChecked()).toBe(false);
  });

  test("should reset form when dialog is closed", async ({ page }) => {
    await page.click('role=button[name="Upload Package"]');

    await page.fill('input[placeholder="Enter URL to GitHub or npm package"]', "https://github.com/sample/repo");
    const debloatCheckbox = page.locator('input[name="debloat"]');
    await debloatCheckbox.check();

    await page.click('button:has-text("Cancel")');

    await page.click('role=button[name="Upload Package"]');
    expect(await page.locator('input[placeholder="Enter URL to GitHub or npm package"]').inputValue()).toBe("");
    expect(await debloatCheckbox.isChecked()).toBe(false);
  });

  test("should clear the selected file when Clear File button is clicked", async ({ page }) => {
    await page.click('role=button[name="Upload Package"]');

    const fileInput = page.locator('input[type="file"]');
    const testFilePath = path.resolve(__dirname, "..", "__files__", "test.zip");
    await fileInput.setInputFiles(testFilePath);

    await expect(page.locator("text=Selected file: test.zip")).toBeVisible();

    await page.click('button:has-text("Clear File")');

    await expect(page.locator("text=Selected file:")).not.toBeVisible();

    const fileInputValue = await fileInput.evaluate((input: HTMLInputElement) => input.value);
    expect(fileInputValue).toBe("");
  });
});
