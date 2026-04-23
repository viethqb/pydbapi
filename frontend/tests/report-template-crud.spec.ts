/**
 * Full CRUD for ReportTemplate and SheetMapping:
 *  - Update template fields (name, output_prefix, recalc_enabled).
 *  - Update a mapping (sheet_name + sql_content).
 *  - Delete a mapping.
 *  - Batch-update to change sort_order.
 *  - Delete the whole template.
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
} from "./utils/reportModule.ts"

test.describe.configure({ mode: "serial" })

const NAME_BASE = "e2e-rcrud-"

let minioDsId: string
let sqlDsId: string
let moduleId: string
let templateId: string
let mapping1Id: string
let mapping2Id: string

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

  const m1 = await api.post<{ id: string }>(
    `/api/v1/report-modules/${moduleId}/templates/${templateId}/mappings/create`,
    {
      sort_order: 0,
      sheet_name: "A",
      start_cell: "A1",
      write_mode: "rows",
      write_headers: true,
      sql_content: "SELECT 1",
    },
  )
  mapping1Id = m1.id

  const m2 = await api.post<{ id: string }>(
    `/api/v1/report-modules/${moduleId}/templates/${templateId}/mappings/create`,
    {
      sort_order: 1,
      sheet_name: "B",
      start_cell: "A1",
      write_mode: "rows",
      write_headers: true,
      sql_content: "SELECT 2",
    },
  )
  mapping2Id = m2.id
})

test.afterAll(async () => {
  await deleteReportModule(moduleId).catch(() => {})
  await deleteDataSource(sqlDsId).catch(() => {})
  await deleteDataSource(minioDsId).catch(() => {})
})

test("update template fields is persisted", async () => {
  const newName = `${NAME_BASE}renamed-${Date.now()}`
  const updated = await api.post<{
    id: string
    name: string
    output_prefix: string
    recalc_enabled: boolean
  }>(`/api/v1/report-modules/${moduleId}/templates/update`, {
    id: templateId,
    name: newName,
    output_prefix: "finance/monthly/",
    recalc_enabled: true,
  })
  expect(updated.name).toBe(newName)
  expect(updated.output_prefix).toBe("finance/monthly/")
  expect(updated.recalc_enabled).toBe(true)
})

test("update mapping sheet_name + sql_content is persisted", async () => {
  const updated = await api.post<{
    id: string
    sheet_name: string
    sql_content: string
  }>(
    `/api/v1/report-modules/${moduleId}/templates/${templateId}/mappings/update`,
    {
      id: mapping1Id,
      sheet_name: "Renamed",
      sql_content: "SELECT 999",
    },
  )
  expect(updated.sheet_name).toBe("Renamed")
  expect(updated.sql_content).toBe("SELECT 999")
})

test("batch-update swaps sort_order of two mappings", async () => {
  await api.post(
    `/api/v1/report-modules/${moduleId}/templates/${templateId}/mappings/batch-update`,
    {
      mappings: [
        { id: mapping1Id, sort_order: 5 },
        { id: mapping2Id, sort_order: 2 },
      ],
    },
  )
  const detail = await api.get<{
    sheet_mappings: Array<{ id: string; sort_order: number }>
  }>(`/api/v1/report-modules/${moduleId}/templates/${templateId}`)
  const m1 = detail.sheet_mappings.find((m) => m.id === mapping1Id)
  const m2 = detail.sheet_mappings.find((m) => m.id === mapping2Id)
  expect(m1?.sort_order).toBe(5)
  expect(m2?.sort_order).toBe(2)
})

test("delete one mapping keeps the other", async () => {
  await api.post(
    `/api/v1/report-modules/${moduleId}/templates/${templateId}/mappings/delete?mapping_id=${mapping2Id}`,
  )
  const detail = await api.get<{
    sheet_mappings: Array<{ id: string }>
  }>(`/api/v1/report-modules/${moduleId}/templates/${templateId}`)
  const ids = detail.sheet_mappings.map((m) => m.id)
  expect(ids).toContain(mapping1Id)
  expect(ids).not.toContain(mapping2Id)
})

test("delete template removes it from the module detail", async () => {
  await api.post(
    `/api/v1/report-modules/${moduleId}/templates/delete?tid=${templateId}`,
  )
  const mod = await api.get<{ templates: Array<{ id: string }> }>(
    `/api/v1/report-modules/${moduleId}`,
  )
  const ids = mod.templates.map((t) => t.id)
  expect(ids).not.toContain(templateId)
})
