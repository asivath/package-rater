import { test, expect } from "./baseFixtures";

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
    expect(searchBar).toBeVisible();

    const searchButton = page.locator('button:has-text("Search")');
    expect(searchButton).toBeVisible();
  });

  test("should load the main page and display the upload package button", async ({ page }) => {
    await page.goto("http://localhost:5173");

    const uploadButton = page.locator('role=button[name="Upload Package"]');
    await expect(uploadButton).toBeVisible();
  });
});
