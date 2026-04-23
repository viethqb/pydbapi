import { api } from "./apiClient.ts"
import { createDataSource, deleteDataSource } from "./datasource.ts"

export type ReportModuleRecord = {
  id: string
  name: string
  minio_datasource_id: string
  sql_datasource_id: string
  default_template_bucket: string
  default_output_bucket: string
}

export type ReportTemplateRecord = {
  id: string
  report_module_id: string
  name: string
}

export type CreateReportModuleInput = {
  name: string
  minio_datasource_id: string
  sql_datasource_id: string
  default_template_bucket?: string
  default_output_bucket?: string
}

export async function createReportModule(
  input: CreateReportModuleInput,
): Promise<ReportModuleRecord> {
  return api.post<ReportModuleRecord>("/api/v1/report-modules/create", {
    name: input.name,
    description: null,
    minio_datasource_id: input.minio_datasource_id,
    sql_datasource_id: input.sql_datasource_id,
    default_template_bucket: input.default_template_bucket ?? "templates",
    default_output_bucket: input.default_output_bucket ?? "output",
  })
}

export async function deleteReportModule(id: string): Promise<void> {
  await api.post(`/api/v1/report-modules/delete?id=${id}`)
}

export async function deleteReportModulesMatching(
  prefix: string,
): Promise<void> {
  const res = await api.post<{ data: Array<{ id: string; name: string }> }>(
    "/api/v1/report-modules/list",
    { page: 1, page_size: 100 },
  )
  await Promise.all(
    res.data
      .filter((m) => m.name.startsWith(prefix))
      .map((m) => deleteReportModule(m.id).catch(() => {})),
  )
}

export async function createReportTemplate(
  moduleId: string,
  name: string,
  overrides: Record<string, unknown> = {},
): Promise<ReportTemplateRecord> {
  return api.post<ReportTemplateRecord>(
    `/api/v1/report-modules/${moduleId}/templates/create`,
    {
      name,
      description: null,
      template_bucket: "templates",
      template_path: "",
      output_bucket: "output",
      output_prefix: "",
      recalc_enabled: false,
      ...overrides,
    },
  )
}

export async function deleteReportTemplate(
  moduleId: string,
  templateId: string,
): Promise<void> {
  await api.post(
    `/api/v1/report-modules/${moduleId}/templates/delete?tid=${templateId}`,
  )
}

/**
 * Create a minimal MinIO + Postgres DataSource pair and a ReportModule linked
 * to both. Returns ids so the caller can clean up.
 */
export async function createReportModuleBundle(baseName: string): Promise<{
  module: ReportModuleRecord
  minioDs: { id: string }
  sqlDs: { id: string }
  cleanup: () => Promise<void>
}> {
  const minioDs = await createDataSource({
    name: `${baseName}-minio`,
    product_type: "minio",
    host: "localhost",
    port: 9000,
    database: "default",
    username: "minioadmin",
    password: "minioadmin",
  })
  const sqlDs = await createDataSource({
    name: `${baseName}-pg`,
    product_type: "postgres",
  })
  const module = await createReportModule({
    name: baseName,
    minio_datasource_id: minioDs.id,
    sql_datasource_id: sqlDs.id,
  })
  const cleanup = async () => {
    await deleteReportModule(module.id).catch(() => {})
    await deleteDataSource(sqlDs.id).catch(() => {})
    await deleteDataSource(minioDs.id).catch(() => {})
  }
  return { module, minioDs, sqlDs, cleanup }
}
