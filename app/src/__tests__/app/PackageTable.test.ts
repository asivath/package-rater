import { test, expect } from "../baseFixtures";

test.describe("PackageTable Component Tests", () => {
  test("should render the search bar and search button with settings cog", async ({ page }) => {
    await page.goto("http://localhost:5173");

    const searchBar = page.locator('input[placeholder="Type package name..."]');
    await expect(searchBar).toBeVisible();

    const searchButton = page.locator('role=button[name="Search"]');
    await expect(searchButton).toBeVisible();

    const settingsButton = page.locator('role=button[name="Settings"]');
    await expect(settingsButton).toBeVisible();
  });

  test("should display packages in the table when fetched and show details when expanded and not remove details when not expanded", async ({
    page
  }) => {
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

    const expandButton = page.locator('role=button[name="expand row"]');
    const versionCell = page.locator(`text=${mockVersion}`);
    const idCell = page.locator(`text=${mockId}`);
    const netScoreCell = page.locator(`text=${mockNetScore}`);

    await expect(versionCell).not.toBeVisible();
    await expect(idCell).not.toBeVisible();
    await expect(netScoreCell).not.toBeVisible();

    await expandButton.click();
    await expect(versionCell).toBeVisible();
    await expect(idCell).toBeVisible();
    await expect(netScoreCell).toBeVisible();

    await expandButton.click();
    await expect(versionCell).not.toBeVisible();
    await expect(idCell).not.toBeVisible();
    await expect(netScoreCell).not.toBeVisible();
  });

  test("should display a warning when no packages are found", async ({ page }) => {
    await page.goto("http://localhost:5173");
    await page.fill('input[placeholder="Type package name..."]', "NonExistentPackage");

    await page.route("**/packages", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify([])
      });
    });

    await page.locator('role=button[name="Search"]').click();

    const snackbar = page.locator("role=alert");
    await expect(snackbar).toBeVisible();
    await expect(snackbar).toHaveText("No packages found for the given search term.");
  });

  test("should display an error when an error occurs fetching packages", async ({ page }) => {
    await page.goto("http://localhost:5173");
    await page.fill('input[placeholder="Type package name..."]', "ErrorPackage");

    await page.route("**/packages", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Internal Server Error" })
      });
    });

    await page.locator('role=button[name="Search"]').click();

    const snackbar = page.locator("role=alert");
    await expect(snackbar).toBeVisible();
    await expect(snackbar).toHaveText("Error fetching packages.");
  });

  test("should display settings dialog with regex checkbox and version input, and update visibility correctly", async ({
    page
  }) => {
    await page.goto("http://localhost:5173");

    // Open settings via the settings button
    const settingsButton = page.locator('button[aria-label="Settings"]');
    await settingsButton.click();

    // Locate the regex checkbox using its label text
    const regexCheckbox = page.locator('label:has-text("Search By RegEx") >> input[type="checkbox"]');
    await expect(regexCheckbox).toBeVisible();

    // Locate and verify the version input is visible initially
    const versionInput = page.locator('input[placeholder="Enter version..."]');
    await expect(versionInput).toBeVisible();

    // Check the regex checkbox and verify the version input is hidden
    await regexCheckbox.check();
    await expect(versionInput).not.toBeVisible();

    // Uncheck the regex checkbox and verify the version input reappears
    await regexCheckbox.uncheck();
    await expect(versionInput).toBeVisible();

    // Close the settings menu
    await page.locator("body").click();
  });

  test("should remove version input when regex checkbox is checked", async ({ page }) => {
    await page.goto("http://localhost:5173");

    const settingsButton = page.locator('role=button[name="Settings"]');
    await settingsButton.click();

    const regexCheckbox = page.locator('input[type="checkbox"]');
    await regexCheckbox.check();

    const versionInput = page.locator('input[placeholder="Enter version..."]');
    await expect(versionInput).not.toBeVisible();
  });

  test("should fetch packages by regex when regex checkbox is checked", async ({ page }) => {
    await page.goto("http://localhost:5173");

    // Open settings menu via the settings button
    const settingsButton = page.locator('button[aria-label="Settings"]');
    await settingsButton.click();

    // Locate and check the regex checkbox
    const regexCheckbox = page.locator('label:has-text("Search By RegEx") >> input[type="checkbox"]');
    await regexCheckbox.check();

    // Close the settings menu
    await page.locator("body").click();

    // Mock data
    const mockRegex = ".*";
    const mockPackageName = "TestPackage";
    const mockVersion = "1.0.0";
    const mockId = "12345";
    const mockNetScore = 0.9;

    // Fill in the regex pattern in the search bar
    const searchBar = page.locator('input[placeholder="Type package name..."]');
    await searchBar.fill(mockRegex);

    // Intercept the API call for regex search
    await page.route("**/package/byRegEx", async (route) => {
      const request = route.request();
      const requestBody = await request.postDataJSON();

      // Validate the request body contains the regex pattern
      expect(requestBody).toEqual({ RegEx: mockRegex });

      // Respond with mock package data
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

    // Click the search button to trigger the search
    const searchButton = page.locator('button:has-text("Search")');
    await searchButton.click();

    // Verify the package appears in the table
    const tableRow = page.locator(`text=${mockPackageName}`);
    await expect(tableRow).toBeVisible();

    // Verify other fields in the table
    const expandButton = page.locator(`button[aria-label="expand row"]`);
    await expandButton.click();
    await expect(page.locator(`text=${mockVersion}`)).toBeVisible();
    await expect(page.locator(`text=${mockId}`)).toBeVisible();
    await expect(page.locator(`text=${mockNetScore}`)).toBeVisible();
  });

  test("should send version and package name when search button is clicked with version input filled", async ({
    page
  }) => {
    await page.goto("http://localhost:5173");

    const mockPackageName = "TestPackage";
    const mockVersion = "1.0.0";

    const searchBar = page.locator('input[placeholder="Type package name..."]');
    await searchBar.fill(mockPackageName);

    const settingsButton = page.locator('role=button[name="Settings"]');
    await settingsButton.click();

    const versionInput = page.locator('input[placeholder="Enter version..."]');
    await versionInput.fill(mockVersion);

    await page.locator("body").click();

    await page.route("**/packages", async (route) => {
      const request = route.request();
      const requestBody = await request.postDataJSON();

      expect(requestBody).toEqual([
        {
          Name: mockPackageName,
          Version: mockVersion
        }
      ]);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([])
      });
    });

    const searchButton = page.locator('role=button[name="Search"]');
    await searchButton.click();
  });
});
