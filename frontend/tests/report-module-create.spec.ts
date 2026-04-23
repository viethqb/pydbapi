/**
 * Verifies ReportModule create form:
 *  - Required validation on default_template_bucket / default_output_bucket
 *    (regression: previously optional on both FE zod schema and BE schema).
 *  - Happy path: selecting MinIO datasource enables bucket dropdowns and
 *    submitting creates a module with the chosen buckets.
 */
import {
  createDataSource,
  deleteDataSource,
  deleteDataSourcesMatching,
} from "./utils/datasource.ts"
import { expect, test } from "./utils/fixtures.ts"
import { deleteReportModulesMatching } from "./utils/reportModule.ts"

// Tests in this file share a MinIO + SQL datasource created in beforeAll.
// Run serially so the dropdown only shows one instance of each.
test.describe.configure({ mode: "serial" })

let minioDsId: string
let sqlDsId: string

test.beforeAll(async () => {
  // Clean stale fixtures left over from a previously aborted run.
  await deleteReportModulesMatching("e2e-module-")
  await deleteDataSourcesMatching("rm-minio-")
  await deleteDataSourcesMatching("rm-pg-")

  const minio = await createDataSource({
    name: `rm-minio-${Date.now()}`,
    product_type: "minio",
    host: "localhost",
    port: 9000,
    database: "default",
    username: "minioadmin",
    password: "minioadmin",
  })
  const sql = await createDataSource({ name: `rm-pg-${Date.now()}` })
  minioDsId = minio.id
  sqlDsId = sql.id
})

test.afterAll(async () => {
  await deleteReportModulesMatching("e2e-module-")
  await deleteDataSource(sqlDsId).catch(() => {})
  await deleteDataSource(minioDsId).catch(() => {})
})

test.describe("Report Module create form", () => {
  test("shows required errors when buckets are empty", async ({ page }) => {
    await page.goto("/report-management/modules/create")
    await page.getByRole("heading", { name: "Create Report Module" }).waitFor()

    await page.getByPlaceholder("Report module name").fill("validation-test")
    await page.getByRole("button", { name: "Create Module" }).click()

    // Zod form resolver surfaces the two required errors via FormMessage.
    await expect(
      page.getByText("Default template bucket is required"),
    ).toBeVisible()
    await expect(
      page.getByText("Default output bucket is required"),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/modules\/create$/)
  })

  test("creates module with selected buckets (happy path)", async ({
    page,
  }) => {
    const name = `e2e-module-${Date.now()}`
    await page.goto("/report-management/modules/create")
    await page.getByRole("heading", { name: "Create Report Module" }).waitFor()

    await page.getByPlaceholder("Report module name").fill(name)

    // MinIO datasource combobox
    await page.getByRole("combobox").nth(0).click()
    await page
      .getByRole("option")
      .filter({ hasText: /rm-minio-/ })
      .click()

    // SQL datasource combobox
    await page.getByRole("combobox").nth(1).click()
    await page
      .getByRole("option")
      .filter({ hasText: /rm-pg-/ })
      .click()

    // Template bucket — shadcn Select trigger renders role=combobox
    await page.getByRole("combobox").nth(2).click()
    await page.getByRole("option", { name: "templates" }).click()

    // Output bucket
    await page.getByRole("combobox").nth(3).click()
    await page.getByRole("option", { name: "output" }).click()

    await page.getByRole("button", { name: "Create Module" }).click()

    await page.waitForURL("**/report-management/modules")
    await expect(page.getByText(name).first()).toBeVisible()
  })
})
