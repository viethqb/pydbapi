/**
 * Create a Python-SCRIPT API endpoint:
 *  - Same seed as api-sql-create (Postgres DS + ApiModule).
 *  - Switches execute_engine to SCRIPT; the form auto-fills a template
 *    script so we can submit without typing more content.
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

const MOD_PREFIX = "e2e-scriptapi-mod-"
const DS_PREFIX = "e2e-scriptapi-ds-"
const PATH_PREFIX = "e2e-scriptapi-"

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
  const mod = await createApiModule(moduleName, "for Python script API spec")
  const ds = await createDataSource({ name: datasourceName })
  moduleId = mod.id
  datasourceId = ds.id
})

test.afterAll(async () => {
  await cleanupApis()
  await deleteApiModule(moduleId).catch(() => {})
  await deleteDataSource(datasourceId).catch(() => {})
})

test.describe("API SCRIPT create", () => {
  test("creates a Python SCRIPT API", async ({ page }) => {
    const path = `${PATH_PREFIX}${Date.now()}`
    const apiName = `${PATH_PREFIX}${Date.now()}`

    await page.goto(`/api-dev/apis/create?module_id=${moduleId}`)
    await expect(
      page.getByRole("heading", { name: "Create API" }),
    ).toBeVisible()

    await page.getByPlaceholder("My API").fill(apiName)
    await page.getByPlaceholder("users or users/{id}").fill(path)

    await page.getByRole("tab", { name: "Content" }).click()

    // Switch execute_engine from SQL to SCRIPT. The engine Select is the
    // combobox whose trigger currently shows "SQL" inside the Content tab.
    const engineTrigger = page
      .getByRole("tabpanel", { name: "Content" })
      .getByRole("combobox")
      .filter({ hasText: "SQL" })
      .first()
    await engineTrigger.click()
    await page.getByRole("option", { name: "SCRIPT" }).click()

    // Pick datasource.
    await page
      .locator("button")
      .filter({ hasText: /Select datasource/i })
      .first()
      .click()
    await page.getByRole("option", { name: datasourceName }).click()

    // Monaco is pre-populated with the script template on engine switch.
    await page.getByRole("button", { name: "Create API" }).click()

    await page.waitForURL(/\/api-dev\/apis\/[0-9a-f-]+$/)

    // Filter the list so the newly-created path fits on page 1 regardless
    // of how many APIs already exist.
    await page.goto("/api-dev/apis")
    await page
      .getByPlaceholder("Search APIs by name, path, or description...")
      .fill(path)
    await expect(page.getByText(path).first()).toBeVisible()
  })
})
