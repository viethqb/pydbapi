/**
 * System Groups: create a group via the dialog on the list page.
 */
import { api } from "./utils/apiClient.ts"
import { expect, test } from "./utils/fixtures.ts"

test.describe.configure({ mode: "serial" })

const NAME_PREFIX = "e2e-group-"

async function cleanupGroups() {
  const res = await api.post<{ data: Array<{ id: string; name: string }> }>(
    "/api/v1/groups/list",
    { page: 1, page_size: 100 },
  )
  await Promise.all(
    res.data
      .filter((g) => g.name.startsWith(NAME_PREFIX))
      .map((g) => api.delete(`/api/v1/groups/delete/${g.id}`).catch(() => {})),
  )
}

test.beforeAll(cleanupGroups)
test.afterAll(cleanupGroups)

test.describe("System Groups", () => {
  test("opens Create Group dialog and creates a group", async ({ page }) => {
    const name = `${NAME_PREFIX}${Date.now()}`

    await page.goto("/system/groups")
    await page.getByRole("heading", { name: "Groups" }).waitFor()

    await page.getByRole("button", { name: /Create Group/i }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("Create Group")).toBeVisible()

    await dialog.getByPlaceholder("Group name").fill(name)
    await dialog.getByPlaceholder("Group description").fill("spec-created")
    await dialog.getByRole("button", { name: "Create" }).click()

    await expect(dialog).not.toBeVisible()
    await expect(page.getByText(name).first()).toBeVisible()
  })
})
