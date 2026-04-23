/**
 * Verifies ReportTemplate create form after the 422 fix:
 *  - Payload now carries `template_bucket` / `output_bucket` derived from the
 *    selected module, so the request succeeds instead of 422.
 *  - FileSelect is always a controlled Select; no React
 *    "uncontrolled → controlled" warning is emitted during the flow.
 */
import {
  createDataSource,
  deleteDataSource,
  deleteDataSourcesMatching,
} from "./utils/datasource.ts"
import { expect, test } from "./utils/fixtures.ts"
import {
  createReportModule,
  deleteReportModule,
  deleteReportModulesMatching,
} from "./utils/reportModule.ts"

test.describe.configure({ mode: "serial" })

let minioDsId: string
let sqlDsId: string
let moduleId: string
let moduleName: string

test.beforeAll(async () => {
  await deleteReportModulesMatching("tpl-mod-")
  await deleteDataSourcesMatching("tpl-minio-")
  await deleteDataSourcesMatching("tpl-pg-")

  const minio = await createDataSource({
    name: `tpl-minio-${Date.now()}`,
    product_type: "minio",
    host: "localhost",
    port: 9000,
    database: "default",
    username: "minioadmin",
    password: "minioadmin",
  })
  const sql = await createDataSource({ name: `tpl-pg-${Date.now()}` })
  minioDsId = minio.id
  sqlDsId = sql.id

  moduleName = `tpl-mod-${Date.now()}`
  const module = await createReportModule({
    name: moduleName,
    minio_datasource_id: minio.id,
    sql_datasource_id: sql.id,
    default_template_bucket: "templates",
    default_output_bucket: "output",
  })
  moduleId = module.id
})

test.afterAll(async () => {
  await deleteReportModule(moduleId).catch(() => {})
  await deleteDataSource(sqlDsId).catch(() => {})
  await deleteDataSource(minioDsId).catch(() => {})
})

test.describe("Report Template create form", () => {
  test("creates template without 422 and without controlled/uncontrolled warning", async ({
    page,
  }) => {
    const name = `e2e-tpl-${Date.now()}`

    // Navigate with module pre-selected via query param.
    await page.goto(`/report-management/templates/create?module_id=${moduleId}`)
    await page
      .getByRole("heading", { name: "Create Report Template" })
      .waitFor()

    // Name is required by the submit-button's disabled={!form.name} guard.
    await page.getByPlaceholder("monthly-report").fill(name)

    // Capture the outbound template-create request to assert the payload now
    // contains both bucket fields (the regression).
    const [request] = await Promise.all([
      page.waitForRequest(
        (r) =>
          r.url().includes(`/report-modules/${moduleId}/templates/create`) &&
          r.method() === "POST",
      ),
      page.getByRole("button", { name: "Create Template" }).click(),
    ])
    const payload = JSON.parse(request.postData() || "{}")
    expect(payload.template_bucket).toBe("templates")
    expect(payload.output_bucket).toBe("output")
    expect(payload.name).toBe(name)

    // Successful create redirects to the template detail page.
    await page.waitForURL(/\/report-management\/templates\/[0-9a-f-]+/)
  })
})
