/**
 * Format config is applied to the generated workbook:
 *  - Header row font becomes bold with a custom color (via FontFormat).
 *  - Header fill bg_color is set.
 *  - Data number_format ("0.00") survives the round-trip.
 *  - column_widths are applied to the requested columns.
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
const NAME_BASE = "e2e-rfmt-"

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
      sql_content: "SELECT 1 AS id, 12.345 AS price",
      format_config: {
        header: {
          font: { bold: true, color: "FFFFFFFF" },
          fill: { bg_color: "FF000000", pattern: "solid" },
        },
        data: { number_format: "0.00" },
        column_widths: { A: 20, B: 15 },
      },
    },
  )
})

test.afterAll(async () => {
  await deleteReportTemplate(moduleId, templateId).catch(() => {})
  await deleteReportModule(moduleId).catch(() => {})
  await deleteDataSource(sqlDsId).catch(() => {})
  await deleteDataSource(minioDsId).catch(() => {})
})

test("generated xlsx carries the configured formatting", async () => {
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
  const ws = wb.getWorksheet("Data")
  expect(ws).toBeDefined()

  // Header cell font.bold + color.
  const h1 = ws?.getCell("A1")
  expect(h1?.font?.bold).toBe(true)
  // exceljs surfaces color as {argb: "FFFFFFFF"}; allow either exact ARGB
  // or no alpha prefix.
  const fontColor = h1?.font?.color?.argb?.toUpperCase()
  expect(fontColor).toBe("FFFFFFFF")

  // Header fill bg color.
  const fill = h1?.fill as ExcelJS.FillPattern | undefined
  expect(fill?.type).toBe("pattern")
  expect(fill?.pattern).toBe("solid")
  const fgColor = (
    fill?.fgColor as ExcelJS.Color | undefined
  )?.argb?.toUpperCase()
  expect(fgColor).toBe("FF000000")

  // Data cell uses the configured number format.
  const dataCell = ws?.getCell("B2")
  expect(dataCell?.numFmt).toBe("0.00")

  // Column widths.
  expect(ws?.getColumn("A").width).toBeCloseTo(20, 0)
  expect(ws?.getColumn("B").width).toBeCloseTo(15, 0)
})
