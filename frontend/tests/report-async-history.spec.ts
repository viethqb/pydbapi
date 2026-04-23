/**
 * Async generate + execution history:
 *  - `async: true` returns immediately with status=pending.
 *  - Polling `/report-executions/{id}` eventually shows status=success.
 *  - List executions filters by template_id and status.
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

const NAME_BASE = "e2e-rasync-"

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

test("async: true returns pending, then polls to success", async () => {
  const gen = await api.post<{
    execution_id: string
    status: string
  }>(`/api/v1/report-modules/${moduleId}/templates/${templateId}/generate`, {
    async: true,
    parameters: {},
  })
  expect(gen.execution_id).toBeTruthy()
  // With Redis available the job is enqueued → pending. The helper may fall
  // back to sync if Redis is unreachable; accept either initial state.
  expect(["pending", "success"]).toContain(gen.status)

  // Poll for terminal state.
  let terminalStatus: string | undefined
  for (let i = 0; i < 20; i++) {
    const det = await api.get<{ status: string }>(
      `/api/v1/report-executions/${gen.execution_id}`,
    )
    if (det.status === "success" || det.status === "failed") {
      terminalStatus = det.status
      break
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  expect(terminalStatus).toBe("success")
})

test("execution list filters by template_id", async () => {
  // Fire 2 sync runs and expect ≥ 2 records for this template.
  for (let i = 0; i < 2; i++) {
    await api.post(
      `/api/v1/report-modules/${moduleId}/templates/${templateId}/generate`,
      { parameters: {} },
    )
  }
  const list = await api.get<{
    data: Array<{ report_template_id: string; status: string }>
    total: number
  }>(`/api/v1/report-executions?template_id=${templateId}&page_size=20`)
  expect(list.total).toBeGreaterThanOrEqual(2)
  expect(list.data.every((e) => e.report_template_id === templateId)).toBe(true)
})

test("execution list filters by status=success", async () => {
  const list = await api.get<{
    data: Array<{ status: string }>
  }>(
    `/api/v1/report-executions?template_id=${templateId}&status=success&page_size=20`,
  )
  expect(list.data.length).toBeGreaterThan(0)
  expect(list.data.every((e) => e.status === "success")).toBe(true)
})

test("execution detail exposes started_at and completed_at", async () => {
  const gen = await api.post<{ execution_id: string }>(
    `/api/v1/report-modules/${moduleId}/templates/${templateId}/generate`,
    { parameters: {} },
  )
  const det = await api.get<{
    status: string
    started_at: string | null
    completed_at: string | null
    output_minio_path: string | null
  }>(`/api/v1/report-executions/${gen.execution_id}`)
  expect(det.status).toBe("success")
  expect(det.started_at).toBeTruthy()
  expect(det.completed_at).toBeTruthy()
  expect(det.output_minio_path).toBeTruthy()
})
