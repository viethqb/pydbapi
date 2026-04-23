/**
 * End-to-end report generation:
 *  - Seeds Postgres + MinIO DataSource, ReportModule (with buckets already
 *    created in MinIO), ReportTemplate, SheetMapping (SELECT 1 AS ok).
 *  - Navigates to the template detail page → Generate tab → clicks Generate.
 *  - Asserts a success result appears (execution ID + Download button).
 */
import { api } from "./utils/apiClient.ts"
import {
  createDataSource,
  deleteDataSource,
  deleteDataSourcesMatching,
} from "./utils/datasource.ts"
import { expect, test } from "./utils/fixtures.ts"
import {
  createReportModule,
  createReportTemplate,
  deleteReportModule,
  deleteReportModulesMatching,
  deleteReportTemplate,
} from "./utils/reportModule.ts"

test.describe.configure({ mode: "serial" })

const NAME_BASE = "e2e-exec-"

let minioDsId: string
let sqlDsId: string
let moduleId: string
let templateId: string

test.beforeAll(async () => {
  await deleteReportModulesMatching(NAME_BASE)
  await deleteDataSourcesMatching(`${NAME_BASE}minio-`)
  await deleteDataSourcesMatching(`${NAME_BASE}pg-`)

  const minio = await createDataSource({
    name: `${NAME_BASE}minio-${Date.now()}`,
    product_type: "minio",
    host: "localhost",
    port: 9000,
    database: "default",
    username: "minioadmin",
    password: "minioadmin",
  })
  const sql = await createDataSource({ name: `${NAME_BASE}pg-${Date.now()}` })
  minioDsId = minio.id
  sqlDsId = sql.id

  const module = await createReportModule({
    name: `${NAME_BASE}${Date.now()}`,
    minio_datasource_id: minio.id,
    sql_datasource_id: sql.id,
    default_template_bucket: "templates",
    default_output_bucket: "output",
  })
  moduleId = module.id

  const template = await createReportTemplate(
    moduleId,
    `${NAME_BASE}tpl-${Date.now()}`,
  )
  templateId = template.id

  // Attach one SheetMapping via API so generate has something to write.
  await api.post(
    `/api/v1/report-modules/${moduleId}/templates/${templateId}/mappings/create`,
    {
      sort_order: 0,
      sheet_name: "Data",
      start_cell: "A1",
      write_mode: "rows",
      write_headers: true,
      gap_rows: 0,
      sql_content: "SELECT 1 AS ok",
    },
  )
})

test.afterAll(async () => {
  await deleteReportTemplate(moduleId, templateId).catch(() => {})
  await deleteReportModule(moduleId).catch(() => {})
  await deleteDataSource(sqlDsId).catch(() => {})
  await deleteDataSource(minioDsId).catch(() => {})
})

test("generates a report and shows the execution result", async ({ page }) => {
  await page.goto(`/report-management/templates/${templateId}`)
  await page.getByRole("tab", { name: "Generate" }).click()

  await page.getByRole("button", { name: /^Generate$/ }).click()

  // Generation is synchronous by default; wait for the result card.
  await expect(page.getByText(/Generation Result/i)).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText(/Execution ID:/i)).toBeVisible()
})
