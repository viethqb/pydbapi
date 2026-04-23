/**
 * Admin Users page: opening the AddUser dialog and creating a user.
 * Validation + happy path; user is cleaned up via API.
 */

import { api } from "./utils/apiClient.ts"
import { expect, test } from "./utils/fixtures.ts"
import { randomEmail, randomPassword } from "./utils/random.ts"

test.describe.configure({ mode: "serial" })

const USERNAME_PREFIX = "e2euser"

async function cleanupUsers() {
  const res = await api.get<{
    data: Array<{ id: string; username: string }>
  }>("/api/v1/users/?skip=0&limit=200")
  await Promise.all(
    res.data
      .filter((u) => u.username.startsWith(USERNAME_PREFIX))
      .map((u) => api.delete(`/api/v1/users/${u.id}`).catch(() => {})),
  )
}

test.beforeAll(cleanupUsers)
test.afterAll(cleanupUsers)

test.describe("Admin Users", () => {
  test("opens Add User dialog and creates a user", async ({ page }) => {
    const username = `${USERNAME_PREFIX}${Date.now().toString().slice(-8)}`
    const email = randomEmail()
    const password = `Aa1${randomPassword()}!` // meet password policy

    await page.goto("/admin/users")
    await page.getByRole("heading", { name: "Users" }).waitFor()

    await page.getByRole("button", { name: /Add User/i }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("Add User")).toBeVisible()

    await dialog.getByPlaceholder("Username").fill(username)
    await dialog.getByPlaceholder("Email").fill(email)
    await dialog.getByPlaceholder("Full name").fill("E2E Tester")
    // Two Password inputs — use nth indexing.
    await dialog.getByPlaceholder("Password").nth(0).fill(password)
    await dialog.getByPlaceholder("Password").nth(1).fill(password)

    await dialog.getByRole("button", { name: "Save" }).click()

    // Dialog closes, new user appears in table.
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText(username).first()).toBeVisible()
  })
})
