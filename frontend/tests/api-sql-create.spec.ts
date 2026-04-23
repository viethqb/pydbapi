/**
 * Create a SQL API endpoint end-to-end:
 *  - Seeds a Postgres DataSource + ApiModule via API.
 *  - Fills the create form, picks datasource from combobox.
 *  - Types SQL into the Monaco editor.
 *  - Submits, asserts redirect to the detail page, and asserts the API row
 *    appears on the list page.
 */

import { api } from "./utils/apiClient.ts"
import { createApiModule, deleteApiModule } from "./utils/apiModule.ts"
import {
  createDataSource,
  deleteDataSource,
  deleteDataSourcesMatching,
} from "./utils/datasource.ts"
import { expect, test } from "./utils/fixtures.ts"

test.describe.configure({ mode: "serial" })

const MOD_PREFIX = "e2e-sqlapi-mod-"
const DS_PREFIX = "e2e-sqlapi-ds-"
const PATH_PREFIX = "e2e-sqlapi-"

let moduleId: string
let datasourceId: string
let moduleName: string
let datasourceName: string

async function cleanupApis() {
  const res = await api.post<{ data: Array<{ id: string; path: string }> }>(
    "/api/v1/api-assignments/list",
    { page: 1, page_size: 200 },
  )
  await Promise.all(
    res.data
      .filter((a) => a.path.startsWith(PATH_PREFIX))
      .map((a) =>
        api.delete(`/api/v1/api-assignments/delete/${a.id}`).catch(() => {}),
      ),
  )
}

async function cleanupModules() {
  const res = await api.post<{ data: Array<{ id: string; name: string }> }>(
    "/api/v1/modules/list",
    { page: 1, page_size: 100 },
  )
  await Promise.all(
    res.data
      .filter((m) => m.name.startsWith(MOD_PREFIX))
      .map((m) => deleteApiModule(m.id).catch(() => {})),
  )
}

test.beforeAll(async () => {
  await cleanupApis()
  await cleanupModules()
  await deleteDataSourcesMatching(DS_PREFIX)

  moduleName = `${MOD_PREFIX}${Date.now()}`
  datasourceName = `${DS_PREFIX}${Date.now()}`
  const mod = await createApiModule(moduleName, "for SQL API spec")
  const ds = await createDataSource({ name: datasourceName })
  moduleId = mod.id
  datasourceId = ds.id
})

test.afterAll(async () => {
  await cleanupApis()
  await deleteApiModule(moduleId).catch(() => {})
  await deleteDataSource(datasourceId).catch(() => {})
})

test.describe("API SQL create", () => {
  test("creates a SQL API with Monaco content", async ({ page }) => {
    const path = `${PATH_PREFIX}${Date.now()}`
    const apiName = `${PATH_PREFIX}${Date.now()}`

    await page.goto(`/api-dev/apis/create?module_id=${moduleId}`)
    await expect(
      page.getByRole("heading", { name: "Create API" }),
    ).toBeVisible()

    // --- Basic Info tab ---
    await page.getByPlaceholder("My API").fill(apiName)
    await page.getByPlaceholder("users or users/{id}").fill(path)

    // --- Content tab: DataSource + SQL content ---
    await page.getByRole("tab", { name: "Content" }).click()

    // The datasource Select is the one with the "Select datasource (required)"
    // placeholder. Target its trigger.
    await page
      .locator("button")
      .filter({ hasText: /Select datasource/i })
      .first()
      .click()
    await page.getByRole("option", { name: datasourceName }).click()

    // Type SQL into the Monaco editor. Monaco renders a hidden textarea; a
    // plain click on `.monaco-editor` focuses it so keyboard.type reaches it.
    const monaco = page.locator(".monaco-editor").first()
    await monaco.click()
    await page.keyboard.type("SELECT 1 AS ok")

    await page.getByRole("button", { name: "Create API" }).click()

    // Success → detail page.
    await page.waitForURL(/\/api-dev\/apis\/[0-9a-f-]+$/)

    // List page shows the new API path.
    await page.goto("/api-dev/apis")
    await expect(page.getByText(path).first()).toBeVisible()
  })
})
