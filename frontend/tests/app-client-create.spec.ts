/**
 * AppClient (gateway consumer) create flow.
 * - Name is required.
 * - Happy path creates with auto-generated client_id/secret and the new row
 *   appears on the list page.
 */

import { deleteAppClientsMatching } from "./utils/client.ts"
import { expect, test } from "./utils/fixtures.ts"

test.describe.configure({ mode: "serial" })

const NAME_PREFIX = "e2e-client-"

test.beforeAll(async () => {
  await deleteAppClientsMatching(NAME_PREFIX)
})
test.afterAll(async () => {
  await deleteAppClientsMatching(NAME_PREFIX)
})

test.describe("AppClient create", () => {
  test("name required validation", async ({ page }) => {
    await page.goto("/system/clients/create")
    await page.getByRole("heading", { name: "Create Client" }).waitFor()

    const nameInput = page.getByPlaceholder("Client name")
    await nameInput.focus()
    await nameInput.blur()
    await expect(page.getByText("Name is required")).toBeVisible()
  })

  test("creates client with auto-generated credentials", async ({ page }) => {
    const name = `${NAME_PREFIX}${Date.now()}`

    await page.goto("/system/clients/create")
    await page.getByPlaceholder("Client name").fill(name)
    // Leave client_id + client_secret blank for auto-generation.
    await page.getByRole("button", { name: "Create Client" }).click()

    // Redirects back to the list page on success.
    await page.waitForURL("**/system/clients")
    await expect(page.getByText(name).first()).toBeVisible()
  })
})
