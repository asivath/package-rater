import { test, expect } from "../baseFixtures";

test.describe("Main Page Tests", () => {
  test("should load the main page and display the navbar with title and logo", async ({ page }) => {
    await page.goto("http://localhost:5173");

    const navbar = page.locator(".MuiToolbar-root");
    await expect(navbar).toBeVisible();

    const title = await navbar.innerText();
    expect(title).toContain("package-rater");

    const logo = page.locator("img[alt='logo']");
    await expect(logo).toBeVisible();
  });

  test("should load the main page and display the search bar", async ({ page }) => {
    await page.goto("http://localhost:5173");

    const searchBar = page.locator('input[placeholder="Type package name..."]');
    await expect(searchBar).toBeVisible();
  });

  test("should load the main page and display the search button", async ({ page }) => {
    await page.goto("http://localhost:5173");

    const searchBar = page.locator('input[placeholder="Type package name..."]');
    await searchBar.fill("as;dlkfajs;ldkfja;s");

    const searchButton = page.getByRole("button", { name: "Search" });
    await searchButton.click();

    expect(searchButton).toBeVisible();
  });

  test("should load the main page and display the upload package button", async ({ page }) => {
    await page.goto("http://localhost:5173");

    const uploadButton = page.getByRole("button", { name: "Upload Package" });
    await expect(uploadButton).toBeVisible();
  });

  test("should load the main page and display the reset button and click it", async ({ page }) => {
    await page.goto("http://localhost:5173");

    const resetButton = page.getByRole("button", { name: "Reset" });
    await expect(resetButton).toBeVisible();

    await resetButton.click();

    const searchBar = page.locator('input[placeholder="Type package name..."]');
    const searchBarValue = await searchBar.inputValue();
    expect(searchBarValue).toBe("");
  });
});
