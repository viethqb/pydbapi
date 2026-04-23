/**
 * SheetMapping write modes:
 *  - write_mode: "single" writes the first column of the first row to
 *    start_cell (scalar placement).
 *  - Multiple mappings on the same sheet with gap_rows leave blank rows
 *    between blocks.
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
  deleteReportModule,
  deleteReportModulesMatching,
} from "./utils/reportModule.ts"

test.describe.configure({ mode: "serial" })

const API_BASE =
  process.env.PLAYWRIGHT_API_URL ||
  process.env.VITE_API_URL ||
  "http://localhost:8000"
const NAME_BASE = "e2e-rwm-"

let minioDsId: string
let sqlDsId: string
let moduleId: string

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

  const mod = await createReportModule({
    name: `${NAME_BASE}${Date.now()}`,
    minio_datasource_id: minio.id,
    sql_datasource_id: sql.id,
    default_template_bucket: "templates",
    default_output_bucket: "output",
  })
  moduleId = mod.id
})

test.afterAll(async () => {
  await deleteReportModule(moduleId).catch(() => {})
  await deleteDataSource(sqlDsId).catch(() => {})
  await deleteDataSource(minioDsId).catch(() => {})
})

async function downloadExcel(templateId: string): Promise<ExcelJS.Workbook> {
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
  return wb
}

test('write_mode: "single" places the first-column scalar at start_cell', async () => {
  const tpl = await api.post<{ id: string }>(
    `/api/v1/report-modules/${moduleId}/templates/create`,
    {
      name: `${NAME_BASE}single-${Date.now()}`,
      description: null,
      template_bucket: "templates",
      template_path: "",
      output_bucket: "output",
      output_prefix: "",
      recalc_enabled: false,
    },
  )
  await api.post(
    `/api/v1/report-modules/${moduleId}/templates/${tpl.id}/mappings/create`,
    {
      sort_order: 0,
      sheet_name: "Summary",
      start_cell: "C3",
      write_mode: "single",
      write_headers: false,
      sql_content: "SELECT 42 AS total",
    },
  )
  const wb = await downloadExcel(tpl.id)
  const ws = wb.getWorksheet("Summary")
  expect(ws).toBeDefined()
  expect(Number(ws?.getCell("C3").value)).toBe(42)
  // Adjacent cells stay empty.
  expect(ws?.getCell("B3").value ?? null).toBeNull()
  expect(ws?.getCell("C2").value ?? null).toBeNull()

  await api.post(
    `/api/v1/report-modules/${moduleId}/templates/delete?tid=${tpl.id}`,
  )
})

test("gap_rows places blank rows between two row-mode blocks on the same sheet", async () => {
  const tpl = await api.post<{ id: string }>(
    `/api/v1/report-modules/${moduleId}/templates/create`,
    {
      name: `${NAME_BASE}gap-${Date.now()}`,
      description: null,
      template_bucket: "templates",
      template_path: "",
      output_bucket: "output",
      output_prefix: "",
      recalc_enabled: false,
    },
  )

  // Block 1: header + 2 data rows at A1:A3.
  await api.post(
    `/api/v1/report-modules/${moduleId}/templates/${tpl.id}/mappings/create`,
    {
      sort_order: 0,
      sheet_name: "Data",
      start_cell: "A1",
      write_mode: "rows",
      write_headers: true,
      sql_content: "SELECT id FROM (VALUES (10),(11)) AS t(id) ORDER BY id",
    },
  )
  // Block 2: same sheet, gap_rows=2 → engine appends after block1 + 2 blank
  // rows. With headers=true and 2 data rows, block1 occupies A1..A3; expect
  // block2 to start around row 6 (A4,A5 blank; header at A6; data at A7,A8).
  await api.post(
    `/api/v1/report-modules/${moduleId}/templates/${tpl.id}/mappings/create`,
    {
      sort_order: 1,
      sheet_name: "Data",
      start_cell: "A1",
      write_mode: "rows",
      write_headers: true,
      gap_rows: 2,
      sql_content:
        "SELECT label FROM (VALUES ('x'),('y')) AS t(label) ORDER BY label",
    },
  )

  const wb = await downloadExcel(tpl.id)
  const ws = wb.getWorksheet("Data")
  expect(ws).toBeDefined()
  // Block 1.
  expect(ws?.getCell("A1").value).toBe("id")
  expect(Number(ws?.getCell("A2").value)).toBe(10)
  expect(Number(ws?.getCell("A3").value)).toBe(11)
  // Gap rows.
  expect(ws?.getCell("A4").value ?? null).toBeNull()
  expect(ws?.getCell("A5").value ?? null).toBeNull()
  // Block 2 header + data.
  expect(ws?.getCell("A6").value).toBe("label")
  expect(ws?.getCell("A7").value).toBe("x")
  expect(ws?.getCell("A8").value).toBe("y")
})
