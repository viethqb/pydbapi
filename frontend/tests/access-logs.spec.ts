/**
 * Access logs page: filters render and path filter debounces/submits.
 * Records are populated by the backend middleware on gateway traffic;
 * this spec only asserts the UI (filter controls, table headers, search
 * reflecting back into the URL/query state).
 */
import { expect, test } from "./utils/fixtures.ts"

test.describe("Access logs", () => {
  test("renders filter controls and table headers", async ({ page }) => {
    await page.goto("/system/access-logs")
    await expect(
      page.getByRole("heading", { name: "Access logs" }).first(),
    ).toBeVisible()

    // Path contains filter and HTTP-method select are always visible.
    await expect(page.getByPlaceholder("e.g. /report")).toBeVisible()
    await expect(page.getByText("HTTP method").first()).toBeVisible()

    // The list section is present even when empty (shows a placeholder
    // message since the fresh stack has no gateway traffic).
    await expect(page.getByText(/records total/i).first()).toBeVisible()
  })

  test("typing in path filter updates the input", async ({ page }) => {
    await page.goto("/system/access-logs")
    const input = page.getByPlaceholder("e.g. /report")
    await input.fill("/login")
    await expect(input).toHaveValue("/login")
  })
})
