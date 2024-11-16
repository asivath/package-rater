import { test, expect } from "./baseFixtures";

test.describe("PackageTable Component Tests", () => {
  test("should render the search bar and search button", async ({ page }) => {
    await page.goto("http://localhost:5173");

    const searchBar = page.locator('input[placeholder="Search by package name"]');
    await expect(searchBar).toBeVisible();

    const searchButton = page.locator('role=button[name="Search"]');
    await expect(searchButton).toBeVisible();
  });

  test("should display packages in the table when fetched", async ({ page }) => {
    await page.goto("http://localhost:5173");

    const mockPackageName = "TestPackage";
    const mockVersion = "1.0.0";
    const mockId = "12345";

    await page.locator('role=button[name="Search"]').click();

    const tableRow = page.locator(`text=${mockPackageName}`);
    await expect(tableRow).toBeVisible();

    const versionCell = page.locator(`text=${mockVersion}`);
    const idCell = page.locator(`text=${mockId}`);
    await expect(versionCell).toBeVisible();
    await expect(idCell).toBeVisible();
  });

  test("should display a warning when no packages are found", async ({ page }) => {
    await page.goto("http://localhost:5173");

    await page.fill('input[placeholder="Search by package name"]', "NonExistentPackage");
    await page.locator('role=button[name="Search"]').click();

    const snackbar = page.locator("role=alert");
    await expect(snackbar).toBeVisible();
    await expect(snackbar).toHaveText("No packages found for the given search term.");
  });

  test("should expand a package row to display version details", async ({ page }) => {
    await page.goto("http://localhost:5173");

    const mockPackageName = "ExpandablePackage";
    const mockVersion = "2.0.0";

    const expandButton = page.locator(`text=${mockPackageName} >> button`);
    await expect(expandButton).toBeVisible();

    await expandButton.click();

    const versionCell = page.locator(`text=${mockVersion}`);
    await expect(versionCell).toBeVisible();
  });

  test("should close the expanded row when toggled", async ({ page }) => {
    await page.goto("http://localhost:5173");

    const mockPackageName = "ExpandablePackage";
    const expandButton = page.locator(`text=${mockPackageName} >> button`);
    await expandButton.click();

    await expandButton.click();

    const versionDetails = page.locator(`text=Version Number`);
    await expect(versionDetails).not.toBeVisible();
  });
});
