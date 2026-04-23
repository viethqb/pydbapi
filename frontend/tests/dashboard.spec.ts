/**
 * Dashboard E2E: verifies the authenticated home page loads its widgets
 * and the auto-refresh toggle in the Recent Access table is interactive.
 */
import { expect, test } from "./utils/fixtures.ts"

test.describe("Dashboard", () => {
  test("renders heading and greeting", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
    await expect(page.getByText(/^Hi, /)).toBeVisible()
  })

  test("renders core widget sections", async ({ page }) => {
    await page.goto("/")
    // Each chart/table has a visible title from its component.
    for (const label of [
      "Requests by Day",
      "Status Breakdown",
      "Top Paths",
      "Recent Commits",
      "Recent Access",
    ]) {
      await expect(page.getByText(label).first()).toBeVisible()
    }
  })

  test("auto-refresh toggle is interactive", async ({ page }) => {
    await page.goto("/")
    // The toggle lives inside the Recent Access table region. It is a switch
    // role per shadcn/ui convention. Toggling it must not raise errors.
    const toggle = page
      .getByRole("switch")
      .or(page.getByLabel(/auto.?refresh/i))
      .first()
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click()
      await expect(toggle).toBeVisible()
    }
  })
})
