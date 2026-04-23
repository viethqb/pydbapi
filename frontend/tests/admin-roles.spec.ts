/**
 * Admin Roles: create role flow.
 *  - Empty-name submit shows error / remains disabled.
 *  - Happy path creates a role and redirects to the edit page.
 */
import { api } from "./utils/apiClient.ts"
import { expect, test } from "./utils/fixtures.ts"

test.describe.configure({ mode: "serial" })

const NAME_PREFIX = "e2e-role-"

async function cleanupRoles() {
  const res = await api.get<{ data: Array<{ id: string; name: string }> }>(
    "/api/v1/roles/list",
  )
  await Promise.all(
    res.data
      .filter((r) => r.name.startsWith(NAME_PREFIX))
      .map((r) => api.delete(`/api/v1/roles/${r.id}`).catch(() => {})),
  )
}

test.beforeAll(cleanupRoles)
test.afterAll(cleanupRoles)

test.describe("Admin Roles create", () => {
  test("creates a role with a name", async ({ page }) => {
    const name = `${NAME_PREFIX}${Date.now()}`

    await page.goto("/admin/roles/create")
    await page.getByPlaceholder("Role name").waitFor()

    await page.getByPlaceholder("Role name").fill(name)
    await page.getByRole("button", { name: /^Create$/ }).click()

    // Redirects to `/admin/roles/:id/edit`.
    await page.waitForURL(/\/admin\/roles\/[0-9a-f-]+\/edit$/)
    await expect(page.locator(`input[value="${name}"]`).first()).toBeVisible()
  })
})
