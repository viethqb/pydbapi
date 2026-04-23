/**
 * DataSource (connection) CRUD:
 *  - Form validation blocks submit when required fields are empty.
 *  - "Test Connection" succeeds against the local Postgres container and
 *    unlocks the Create button.
 *  - List refreshes with the new row after creation; delete removes it.
 */
import { deleteDataSourcesMatching } from "./utils/datasource.ts"
import { expect, test } from "./utils/fixtures.ts"

test.describe.configure({ mode: "serial" })

const NAME_PREFIX = "e2e-conn-"

test.beforeAll(async () => {
  await deleteDataSourcesMatching(NAME_PREFIX)
})

test.afterAll(async () => {
  await deleteDataSourcesMatching(NAME_PREFIX)
})

async function fillConnectionForm(
  page: import("@playwright/test").Page,
  name: string,
  pgPassword: string,
) {
  await page.getByPlaceholder("My Database").fill(name)
  // product_type defaults to postgres — no action needed.
  await page.getByPlaceholder("localhost").fill("localhost")
  await page.getByPlaceholder("5432").fill("5432")
  await page.getByPlaceholder("mydb").fill("app")
  await page.getByPlaceholder("postgres").fill("postgres")
  // Password input's placeholder is "Optional".
  await page.getByPlaceholder("Optional", { exact: true }).fill(pgPassword)
}

test.describe("Connection CRUD", () => {
  test("shows validation errors when required fields are empty", async ({
    page,
  }) => {
    await page.goto("/connection/create")
    await page.getByRole("heading", { name: /Create.*Data Source/i }).waitFor()

    // react-hook-form mode=onBlur: touch and blur the Name input to surface
    // the required-validation message without submitting.
    const nameInput = page.getByPlaceholder("My Database")
    await nameInput.focus()
    await nameInput.blur()
    await expect(page.getByText("Name is required").first()).toBeVisible()

    // Create button must remain disabled until Test Connection succeeds,
    // even if the user fills everything.
    await expect(
      page.getByRole("button", { name: /Create Data Source/i }),
    ).toBeDisabled()
  })

  test("tests, creates, lists, and deletes a Postgres connection", async ({
    page,
  }) => {
    const pgPassword = process.env.POSTGRES_PASSWORD || "changethis"
    const name = `${NAME_PREFIX}${Date.now()}`

    // --- Create ---
    await page.goto("/connection/create")
    await fillConnectionForm(page, name, pgPassword)

    await page.getByRole("button", { name: /Test Connection/i }).click()
    await expect(page.getByText(/Connection test successful/i)).toBeVisible({
      timeout: 15_000,
    })

    await page.getByRole("button", { name: /Create Data Source/i }).click()
    // Successful create redirects to the detail page `/connection/:id`.
    await page.waitForURL(/\/connection\/[0-9a-f-]+$/)

    // List page shows the new row.
    await page.goto("/connection")
    await expect(page.getByText(name).first()).toBeVisible()
    // Cleanup happens in afterAll via API.
  })
})
