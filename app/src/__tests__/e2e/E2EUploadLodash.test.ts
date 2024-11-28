import { test, expect } from "../baseFixtures";
import { request } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe("Upload Lodash Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5173");
  });

  test("should upload a package from a file succesfully", async ({ page }) => {
    await page.click('role=button[name="Upload Package"]');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.resolve(__dirname, "..", "__files__", "is-even-main.zip"));

    await page.click('button:has-text("Submit")');

    const apiContext = await request.newContext();
    const maxRetries = 10;
    const delay = 5000;
    interface Package {
      Name: string;
      Version: string;
      ID: string;
    }
    let response: Package[] = [];
    let ID = "";
    for (let i = 0; i < maxRetries; i++) {
      const apiRequest = await apiContext.post(
        "http://localhost:3000/packages",
        { data: [{ Name: "lodash", Version: "4.17.21" }] }
      );
      response = await apiRequest.json();
      console.log(response);
      if (response.some((pkg) => pkg.Name === "lodash" && pkg.Version === "4.17.21")) {
        ID = response.find((pkg) => pkg.Name === "lodash" && pkg.Version === "4.17.21")!.ID;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    await expect(page.locator("text=Package uploaded successfully")).toBeVisible();
    expect(response).toContainEqual({ Name: "lodash", Version: "4.17.21", ID });
  });
});
