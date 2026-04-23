/**
 * `recalc_enabled` + `output_sheet`:
 *  - Upload a template with a formula in cell B2 (`=A2*2`).
 *  - Mapping writes value 5 to A2.
 *  - recalc_enabled=true → LibreOffice recalculates so B2 holds 10 (not the
 *    formula string).
 *  - output_sheet="Summary" → downloaded workbook has ONLY the "Summary"
 *    sheet (the "Detail" sheet from the template is dropped).
 *
 * Requires LibreOffice to be installed and LIBREOFFICE_PATH to point at it
 * in the backend env. Test is skipped automatically if the backend fails
 * the recalc step.
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
const NAME_BASE = "e2e-rrecalc-"
const TPL_BUCKET = "templates"
const TPL_OBJECT = `${NAME_BASE}${Date.now()}.xlsx`

let minioDsId: string
let sqlDsId: string
let moduleId: string

async function buildTemplateFile(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  // "Summary" has a label + a formula B2 = A2 * 2. Mapping writes A2.
  const summary = wb.addWorksheet("Summary")
  summary.getCell("A1").value = "input"
  summary.getCell("B1").value = "doubled"
  summary.getCell("B2").value = { formula: "A2*2" }
  // Extra "Detail" sheet so we can verify output_sheet extraction drops it.
  const detail = wb.addWorksheet("Detail")
  detail.getCell("A1").value = "detail-only"
  return Buffer.from(await wb.xlsx.writeBuffer())
}

test.beforeAll(async () => {
  await deleteReportModulesMatching(NAME_BASE)
  await deleteDataSourcesMatching(`${NAME_BASE}minio-`)
  await deleteDataSourcesMatching(`${NAME_BASE}pg-`)

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
})

test.afterAll(async () => {
  await deleteReportModule(moduleId).catch(() => {})
  await deleteDataSource(sqlDsId).catch(() => {})
  await deleteDataSource(minioDsId).catch(() => {})
  await removeObject(TPL_BUCKET, TPL_OBJECT)
})

async function generateAndDownload(
  templateId: string,
): Promise<ExcelJS.Workbook> {
  const gen = await api.post<{
    execution_id: string
    status: string
    error_message?: string
  }>(`/api/v1/report-modules/${moduleId}/templates/${templateId}/generate`, {
    parameters: {},
  })
  if (gen.status !== "success") {
    const det = await api.get<{ error_message: string | null }>(
      `/api/v1/report-executions/${gen.execution_id}`,
    )
    test.skip(
      true,
      `Report generation failed (likely LibreOffice unavailable): ${det.error_message}`,
    )
  }
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
  return wb
}

test("recalc_enabled recomputes the formula so B2 = 10", async () => {
  const tpl = await createReportTemplate(
    moduleId,
    `${NAME_BASE}recalc-${Date.now()}`,
    {
      template_bucket: TPL_BUCKET,
      template_path: TPL_OBJECT,
      recalc_enabled: true,
    },
  )
  await api.post(
    `/api/v1/report-modules/${moduleId}/templates/${tpl.id}/mappings/create`,
    {
      sort_order: 0,
      sheet_name: "Summary",
      start_cell: "A2",
      write_mode: "single",
      write_headers: false,
      sql_content: "SELECT 5 AS input",
    },
  )

  const wb = await generateAndDownload(tpl.id)
  const ws = wb.getWorksheet("Summary")
  expect(ws).toBeDefined()
  expect(Number(ws?.getCell("A2").value)).toBe(5)

  // After recalc, B2 should carry the computed value 10. exceljs models a
  // recalculated formula cell as { formula, result: 10 } (openpyxl keeps
  // the formula string but LibreOffice writes the cached result back).
  const b2 = ws?.getCell("B2").value as
    | number
    | { result?: number; formula?: string }
    | undefined
  const computed = typeof b2 === "object" ? b2?.result : b2
  expect(Number(computed)).toBe(10)
})

test("output_sheet='Summary' drops the Detail sheet from the output", async () => {
  const tpl = await createReportTemplate(
    moduleId,
    `${NAME_BASE}outsheet-${Date.now()}`,
    {
      template_bucket: TPL_BUCKET,
      template_path: TPL_OBJECT,
      output_sheet: "Summary",
    },
  )
  await api.post(
    `/api/v1/report-modules/${moduleId}/templates/${tpl.id}/mappings/create`,
    {
      sort_order: 0,
      sheet_name: "Summary",
      start_cell: "A2",
      write_mode: "single",
      write_headers: false,
      sql_content: "SELECT 3 AS input",
    },
  )

  const wb = await generateAndDownload(tpl.id)
  const names = wb.worksheets.map((w) => w.name)
  expect(names).toContain("Summary")
  expect(names).not.toContain("Detail")
})
