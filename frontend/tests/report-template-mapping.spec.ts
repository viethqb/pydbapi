/**
 * Report Template detail page: add a SheetMapping via the dialog and
 * verify the row appears on the mappings table.
 */
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

const NAME_BASE = "e2e-map-"

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
  const sql = await createDataSource({
    name: `${NAME_BASE}pg-${Date.now()}`,
  })
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
})

test.afterAll(async () => {
  await deleteReportTemplate(moduleId, templateId).catch(() => {})
  await deleteReportModule(moduleId).catch(() => {})
  await deleteDataSource(sqlDsId).catch(() => {})
  await deleteDataSource(minioDsId).catch(() => {})
})

test("adds a Sheet Mapping to a template", async ({ page }) => {
  await page.goto(`/report-management/templates/${templateId}`)
  // Add Mapping lives inside the Mappings tab.
  await page.getByRole("tab", { name: "Mappings" }).click()
  await page
    .getByRole("button", { name: /Add Mapping/i })
    .first()
    .click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("Add Sheet Mapping")).toBeVisible()

  await dialog.getByPlaceholder("e.g. Sheet1").fill("Data")
  await dialog.getByPlaceholder("e.g. A1").fill("A1")
  await dialog.getByPlaceholder("SELECT * FROM ...").fill("SELECT 1 AS ok")

  await dialog.getByRole("button", { name: /Add Mapping/i }).click()
  await expect(dialog).not.toBeVisible()

  // The new mapping should show in the table by sheet name.
  await expect(page.getByText("Data").first()).toBeVisible()
})
