/**
 * template_path — engine loads an existing xlsx from MinIO and fills data
 * into it (fill-mode) rather than creating a blank workbook:
 *   - Static cells in the uploaded template survive in the output.
 *   - SheetMapping writes land at the configured start_cell of a sheet
 *     that is already present in the template.
 */
import ExcelJS from "exceljs"
import { api } from "./utils/apiClient.ts"
import {
  createDataSource,
  deleteDataSource,
  deleteDataSourcesMatching,
} from "./utils/datasource.ts"
import { expect, test } from "./utils/fixtures.ts"
import { removeObject, uploadBuffer } from "./utils/minio.ts"
import {
  createReportModule,
  createReportTemplate,
  deleteReportModule,
  deleteReportModulesMatching,
  deleteReportTemplate,
} from "./utils/reportModule.ts"

test.describe.configure({ mode: "serial" })

const API_BASE =
  process.env.PLAYWRIGHT_API_URL ||
  process.env.VITE_API_URL ||
  "http://localhost:8000"
const NAME_BASE = "e2e-rtpath-"
const TPL_BUCKET = "templates"
const TPL_OBJECT = `${NAME_BASE}${Date.now()}.xlsx`

let minioDsId: string
let sqlDsId: string
let moduleId: string
let templateId: string

async function buildTemplateFile(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  // Sheet "Summary" with a title in A1 and a label in A3 that will stay put.
  const summary = wb.addWorksheet("Summary")
  summary.getCell("A1").value = "Monthly Report"
  summary.getCell("A3").value = "Total orders:"
  // Sheet "Data" will receive rows from a SheetMapping starting at B5.
  const data = wb.addWorksheet("Data")
  data.getCell("A1").value = "(pre-existing header)"
  return Buffer.from(await wb.xlsx.writeBuffer())
}

test.beforeAll(async () => {
  await deleteReportModulesMatching(NAME_BASE)
  await deleteDataSourcesMatching(`${NAME_BASE}minio-`)
  await deleteDataSourcesMatching(`${NAME_BASE}pg-`)

  // Upload the prepared template xlsx to MinIO first, then point the
  // ReportTemplate at it.
  await uploadBuffer(TPL_BUCKET, TPL_OBJECT, await buildTemplateFile())

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

  const mod = await createReportModule({
    name: `${NAME_BASE}${Date.now()}`,
    minio_datasource_id: minio.id,
    sql_datasource_id: sql.id,
    default_template_bucket: TPL_BUCKET,
    default_output_bucket: "output",
  })
  moduleId = mod.id

  const tpl = await createReportTemplate(
    moduleId,
    `${NAME_BASE}tpl-${Date.now()}`,
    { template_bucket: TPL_BUCKET, template_path: TPL_OBJECT },
  )
  templateId = tpl.id

  // Mapping writes into existing "Data" sheet at B5 with headers.
  await api.post(
    `/api/v1/report-modules/${moduleId}/templates/${templateId}/mappings/create`,
    {
      sort_order: 0,
      sheet_name: "Data",
      start_cell: "B5",
      write_mode: "rows",
      write_headers: true,
      sql_content: "SELECT 7 AS qty",
    },
  )
})

test.afterAll(async () => {
  await deleteReportTemplate(moduleId, templateId).catch(() => {})
  await deleteReportModule(moduleId).catch(() => {})
  await deleteDataSource(sqlDsId).catch(() => {})
  await deleteDataSource(minioDsId).catch(() => {})
  await removeObject(TPL_BUCKET, TPL_OBJECT)
})

test("output keeps template's static cells and injects mapping data", async () => {
  const gen = await api.post<{ execution_id: string; status: string }>(
    `/api/v1/report-modules/${moduleId}/templates/${templateId}/generate`,
    { parameters: {} },
  )
  expect(gen.status).toBe("success")

  const { token } = JSON.parse(
    await import("node:fs").then((fs) =>
      fs.readFileSync("playwright/.auth/api-token.json", "utf8"),
    ),
  ) as { token: string }
  const res = await fetch(
    `${API_BASE}/api/v1/report-executions/${gen.execution_id}/download`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(res.status).toBe(200)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()))

  // Static template cells preserved.
  const summary = wb.getWorksheet("Summary")
  expect(summary?.getCell("A1").value).toBe("Monthly Report")
  expect(summary?.getCell("A3").value).toBe("Total orders:")

  // Injected data — header at B5, value at B6.
  const data = wb.getWorksheet("Data")
  expect(data?.getCell("A1").value).toBe("(pre-existing header)")
  expect(data?.getCell("B5").value).toBe("qty")
  expect(Number(data?.getCell("B6").value)).toBe(7)
})
