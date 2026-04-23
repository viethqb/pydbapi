/**
 * Deep report generation: seed a module/template, run Generate via the API,
 * download the resulting Excel from the backend, and parse it with exceljs
 * to assert the expected value landed in cell B2 (header row is A1:B1).
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

const NAME_BASE = "e2e-exec-deep-"

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

  await api.post(
    `/api/v1/report-modules/${moduleId}/templates/${templateId}/mappings/create`,
    {
      sort_order: 0,
      sheet_name: "Data",
      start_cell: "A1",
      write_mode: "rows",
      write_headers: true,
      gap_rows: 0,
      // Two columns, one data row so we can assert header + value positions.
      sql_content: "SELECT 1 AS ok, 'hello-world' AS greeting",
    },
  )
})

test.afterAll(async () => {
  await deleteReportTemplate(moduleId, templateId).catch(() => {})
  await deleteReportModule(moduleId).catch(() => {})
  await deleteDataSource(sqlDsId).catch(() => {})
  await deleteDataSource(minioDsId).catch(() => {})
})

test("generated Excel contains the expected values in Data!A2:B2", async () => {
  // Kick off generation synchronously through the API (UI spec already
  // exercises the click-path; here we focus on the produced artifact).
  const gen = await api.post<{
    execution_id: string
    status: string
    output_minio_path: string | null
  }>(`/api/v1/report-modules/${moduleId}/templates/${templateId}/generate`, {
    parameters: {},
  })
  expect(gen.status).toBe("success")
  expect(gen.execution_id).toBeTruthy()
  expect(gen.output_minio_path).toBeTruthy()

  // Download the xlsx bytes through the authenticated execution endpoint.
  const tokenJson = await import("node:fs").then((fs) =>
    fs.readFileSync("playwright/.auth/api-token.json", "utf8"),
  )
  const { token } = JSON.parse(tokenJson) as { token: string }

  const res = await fetch(
    `${API_BASE}/api/v1/report-executions/${gen.execution_id}/download`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(res.status).toBe(200)
  const bytes = Buffer.from(await res.arrayBuffer())
  expect(bytes.byteLength).toBeGreaterThan(100)

  // Parse the workbook and assert cell values.
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes)
  const sheet = wb.getWorksheet("Data")
  expect(sheet, "Data sheet should exist").toBeDefined()

  // Row 1 is the header (write_headers=true, start_cell=A1):
  expect(sheet?.getCell("A1").value).toBe("ok")
  expect(sheet?.getCell("B1").value).toBe("greeting")

  // Row 2 is the single data row from `SELECT 1 AS ok, 'hello-world' AS greeting`.
  expect(Number(sheet?.getCell("A2").value)).toBe(1)
  expect(String(sheet?.getCell("B2").value)).toBe("hello-world")
})
