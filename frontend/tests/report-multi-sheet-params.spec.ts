/**
 * Multi-sheet output + Jinja2 parameters in the SheetMapping SQL.
 * Two mappings → workbook has 2 worksheets; parameters.min_id filters the
 * rows via `{{ min_id | sql_int }}`.
 */
import ExcelJS from "exceljs"
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

const API_BASE =
  process.env.PLAYWRIGHT_API_URL ||
  process.env.VITE_API_URL ||
  "http://localhost:8000"
const NAME_BASE = "e2e-rmulti-"

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

  // Sheet 1: numbers ≥ min_id. Uses sql_int filter to render the param.
  await api.post(
    `/api/v1/report-modules/${moduleId}/templates/${templateId}/mappings/create`,
    {
      sort_order: 0,
      sheet_name: "Numbers",
      start_cell: "A1",
      write_mode: "rows",
      write_headers: true,
      sql_content:
        "SELECT id FROM (VALUES (1),(2),(3),(4),(5)) AS t(id) WHERE id >= {{ min_id | sql_int }} ORDER BY id",
    },
  )

  // Sheet 2: literal greeting rows, unrelated to parameters.
  await api.post(
    `/api/v1/report-modules/${moduleId}/templates/${templateId}/mappings/create`,
    {
      sort_order: 1,
      sheet_name: "Greetings",
      start_cell: "A1",
      write_mode: "rows",
      write_headers: true,
      sql_content:
        "SELECT msg FROM (VALUES ('hi'),('hello')) AS t(msg) ORDER BY msg",
    },
  )
})

test.afterAll(async () => {
  await deleteReportTemplate(moduleId, templateId).catch(() => {})
  await deleteReportModule(moduleId).catch(() => {})
  await deleteDataSource(sqlDsId).catch(() => {})
  await deleteDataSource(minioDsId).catch(() => {})
})

async function runAndDownload(params: Record<string, unknown>) {
  const gen = await api.post<{
    execution_id: string
    status: string
    output_minio_path: string | null
  }>(`/api/v1/report-modules/${moduleId}/templates/${templateId}/generate`, {
    parameters: params,
  })
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
  return wb
}

test("two mappings produce a 2-sheet workbook", async () => {
  const wb = await runAndDownload({ min_id: 1 })
  expect(wb.getWorksheet("Numbers")).toBeDefined()
  expect(wb.getWorksheet("Greetings")).toBeDefined()
})

test("Jinja2 parameter filters rows: min_id=3 → rows 3,4,5", async () => {
  const wb = await runAndDownload({ min_id: 3 })
  const ws = wb.getWorksheet("Numbers")
  expect(ws).toBeDefined()
  expect(ws?.getCell("A1").value).toBe("id")
  // A2..A4 should be 3,4,5.
  expect(Number(ws?.getCell("A2").value)).toBe(3)
  expect(Number(ws?.getCell("A3").value)).toBe(4)
  expect(Number(ws?.getCell("A4").value)).toBe(5)
  // Row 5 should be empty (only 3 data rows).
  expect(ws?.getCell("A5").value).toBeNull()
})

test("second sheet contents unaffected by parameter", async () => {
  const wb = await runAndDownload({ min_id: 4 })
  const ws = wb.getWorksheet("Greetings")
  expect(ws?.getCell("A1").value).toBe("msg")
  expect(ws?.getCell("A2").value).toBe("hello")
  expect(ws?.getCell("A3").value).toBe("hi")
})
