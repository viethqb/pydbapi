/**
 * ApiModule (API Development) create + list + delete:
 *  - Required `name` validation on the create form.
 *  - Happy path creates a module and redirects to its detail page.
 *  - The new module appears in the modules list.
 */

import { api } from "./utils/apiClient.ts"
import { createApiModule, deleteApiModule } from "./utils/apiModule.ts"
import { expect, test } from "./utils/fixtures.ts"

test.describe.configure({ mode: "serial" })

const NAME_PREFIX = "e2e-apimod-"

async function listAndCleanup(): Promise<void> {
  const res = await api.post<{ data: Array<{ id: string; name: string }> }>(
    "/api/v1/modules/list",
    { page: 1, page_size: 100 },
  )
  await Promise.all(
    res.data
      .filter((m) => m.name.startsWith(NAME_PREFIX))
      .map((m) => deleteApiModule(m.id).catch(() => {})),
  )
}

test.beforeAll(listAndCleanup)
test.afterAll(listAndCleanup)

test.describe("ApiModule create", () => {
  test("name required validation", async ({ page }) => {
    await page.goto("/api-dev/modules/create")
    await page.getByRole("heading", { name: "Create Module" }).waitFor()

    const nameInput = page.getByPlaceholder("My Module")
    await nameInput.focus()
    await nameInput.blur()

    await expect(page.getByText("Name is required")).toBeVisible()
  })

  test("creates module and redirects to detail", async ({ page }) => {
    const name = `${NAME_PREFIX}${Date.now()}`

    await page.goto("/api-dev/modules/create")
    await page.getByPlaceholder("My Module").fill(name)
    await page
      .getByPlaceholder("Optional description")
      .fill("spec-created module")
    await page.getByRole("button", { name: "Create Module" }).click()

    await page.waitForURL(/\/api-dev\/modules\/[0-9a-f-]+/)

    // List shows the new module.
    await page.goto("/api-dev/modules")
    await expect(page.getByText(name).first()).toBeVisible()
  })

  test("created module exists via API and can be cleaned up", async () => {
    // Re-hit the list endpoint to confirm persistence beyond the page cache.
    const res = await api.post<{ data: Array<{ name: string }> }>(
      "/api/v1/modules/list",
      { page: 1, page_size: 100 },
    )
    expect(res.data.some((m) => m.name.startsWith(NAME_PREFIX))).toBe(true)
  })

  test("API-created module appears on list page", async ({ page }) => {
    const name = `${NAME_PREFIX}direct-${Date.now()}`
    await createApiModule(name, "via API helper")
    await page.goto("/api-dev/modules")
    await expect(page.getByText(name).first()).toBeVisible()
  })
})
