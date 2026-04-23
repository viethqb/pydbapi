import { request } from "@/lib/api-request"

// ---------- Types ----------

export type ReportModulePublic = {
  id: string
  name: string
  description: string | null
  minio_datasource_id: string
  sql_datasource_id: string
  default_template_bucket: string
  default_output_bucket: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ReportModuleDetail = ReportModulePublic & {
  client_ids: string[]
  templates: ReportTemplatePublic[]
}

export type ReportModuleCreate = {
  name: string
  description?: string | null
  minio_datasource_id: string
  sql_datasource_id: string
  default_template_bucket: string
  default_output_bucket: string
  is_active?: boolean
}

export type ReportModuleUpdate = {
  id: string
  name?: string | null
  description?: string | null
  minio_datasource_id?: string | null
  sql_datasource_id?: string | null
  default_template_bucket?: string | null
  default_output_bucket?: string | null
  is_active?: boolean | null
}

export type ReportModuleListIn = {
  page?: number
  page_size?: number
  name__ilike?: string | null
  is_active?: boolean | null
}

export type ReportModuleListOut = {
  data: ReportModulePublic[]
  total: number
}

export type FontFormat = {
  name?: string | null
  size?: number | null
  bold?: boolean | null
  italic?: boolean | null
  color?: string | null
}

export type FillFormat = {
  bg_color?: string | null
  pattern?: string | null
}

export type BorderFormat = {
  style?: string | null
  color?: string | null
}

export type AlignmentFormat = {
  horizontal?: string | null
  vertical?: string | null
  wrap_text?: boolean | null
}

export type CellFormat = {
  font?: FontFormat | null
  fill?: FillFormat | null
  border?: BorderFormat | null
  alignment?: AlignmentFormat | null
  number_format?: string | null
}

export type FormatConfig = {
  header?: CellFormat | null
  data?: CellFormat | null
  column_widths?: Record<string, number> | null
  auto_fit?: boolean | null
  auto_fit_max_width?: number | null
  wrap_text?: boolean | null
}

export type ReportTemplatePublic = {
  id: string
  report_module_id: string
  name: string
  description: string | null
  template_bucket: string
  template_path: string
  output_bucket: string
  output_prefix: string
  recalc_enabled: boolean
  output_sheet: string | null
  format_config: FormatConfig | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ReportTemplateDetail = ReportTemplatePublic & {
  sheet_mappings: SheetMappingPublic[]
  client_ids: string[]
}

export type ReportTemplateCreate = {
  name: string
  description?: string | null
  template_bucket: string
  template_path: string
  output_bucket: string
  output_prefix: string
  recalc_enabled?: boolean
  output_sheet?: string | null
}

export type ReportTemplateUpdate = {
  id: string
  name?: string | null
  template_bucket?: string | null
  template_path?: string | null
  output_bucket?: string | null
  output_prefix?: string | null
  recalc_enabled?: boolean | null
  output_sheet?: string | null
  format_config?: FormatConfig | null
}

export type ReportTemplateListIn = {
  page?: number
  page_size?: number
  name__ilike?: string | null
  module_id?: string | null
  is_active?: boolean | null
}

export type ReportTemplateListOut = {
  data: ReportTemplatePublic[]
  total: number
}

export type SheetMappingPublic = {
  id: string
  report_template_id: string
  sheet_name: string
  start_cell: string
  sort_order: number
  write_mode: "rows" | "single"
  write_headers: boolean
  gap_rows: number
  format_config: FormatConfig | null
  sql_content: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type SheetMappingCreate = {
  sheet_name: string
  start_cell: string
  sort_order?: number
  write_mode?: "rows" | "single"
  write_headers?: boolean
  gap_rows?: number
  format_config?: FormatConfig | null
  sql_content: string
}

export type SheetMappingUpdate = {
  id: string
  sheet_name?: string | null
  start_cell?: string | null
  sort_order?: number | null
  write_mode?: "rows" | "single" | null
  write_headers?: boolean | null
  gap_rows?: number | null
  format_config?: FormatConfig | null
  sql_content?: string | null
  description?: string | null
  is_active?: boolean | null
}

export type ReportExecutionPublic = {
  id: string
  report_template_id: string
  status: "pending" | "running" | "success" | "failed"
  parameters: Record<string, unknown> | null
  output_minio_path: string | null
  output_url: string | null
  error_message: string | null
  processed_rows?: number | null
  progress_pct?: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export type ReportExecutionListIn = {
  page?: number
  page_size?: number
  status?: string | null
  module_id?: string | null
  template_id?: string | null
}

export type ReportExecutionListOut = {
  data: ReportExecutionPublic[]
  total: number
}

export type GenerateReportIn = {
  parameters?: Record<string, unknown>
  async?: boolean
}

export type GenerateReportOut = {
  execution_id: string
  status: string
  output_url: string | null
  output_minio_path: string | null
}

export type ReportPreviewIn = {
  parameters?: Record<string, unknown>
  row_limit?: number
}

export type MappingPreviewOut = {
  mapping_id: string
  sheet_name: string
  start_cell: string
  columns: string[]
  rows: Record<string, unknown>[]
  error: string | null
}

export type ReportPreviewOut = {
  mappings: MappingPreviewOut[]
}

// ---------- Report Module Service ----------

export const ReportModuleService = {
  listBuckets: async (datasourceId: string): Promise<string[]> =>
    request<string[]>(`/api/v1/report-modules/buckets/${datasourceId}`),

  listFiles: async (datasourceId: string, bucket: string): Promise<string[]> =>
    request<string[]>(`/api/v1/report-modules/files/${datasourceId}/${bucket}`),

  listSheets: async (
    datasourceId: string,
    bucket: string,
    filePath: string,
  ): Promise<string[]> =>
    request<string[]>(
      `/api/v1/report-modules/sheets/${datasourceId}/${bucket}/${filePath}`,
    ),

  list: async (body: ReportModuleListIn = {}): Promise<ReportModuleListOut> => {
    const requestBody: ReportModuleListIn = {
      page: body.page ?? 1,
      page_size: body.page_size ?? 20,
      ...(body.name__ilike !== undefined &&
        body.name__ilike !== null &&
        body.name__ilike !== "" && { name__ilike: body.name__ilike }),
      ...(body.is_active !== undefined &&
        body.is_active !== null && { is_active: body.is_active }),
    }
    return request<ReportModuleListOut>("/api/v1/report-modules/list", {
      method: "POST",
      body: JSON.stringify(requestBody),
    })
  },

  create: async (body: ReportModuleCreate): Promise<ReportModulePublic> => {
    return request<ReportModulePublic>("/api/v1/report-modules/create", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  update: async (body: ReportModuleUpdate): Promise<ReportModulePublic> => {
    return request<ReportModulePublic>("/api/v1/report-modules/update", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  delete: async (id: string): Promise<{ message: string }> => {
    return request<{ message: string }>(
      `/api/v1/report-modules/delete?id=${id}`,
      { method: "POST" },
    )
  },

  get: async (id: string): Promise<ReportModuleDetail> => {
    return request<ReportModuleDetail>(`/api/v1/report-modules/${id}`, {
      method: "GET",
    })
  },

  // --- Module Clients ---

  getClients: async (id: string): Promise<string[]> => {
    return request<string[]>(`/api/v1/report-modules/${id}/clients`, {
      method: "GET",
    })
  },

  setClients: async (
    id: string,
    clientIds: string[],
  ): Promise<{ message: string }> => {
    return request<{ message: string }>(
      `/api/v1/report-modules/${id}/clients`,
      {
        method: "POST",
        body: JSON.stringify({ client_ids: clientIds }),
      },
    )
  },

  // --- Templates (global) ---

  listAllTemplates: async (
    body: ReportTemplateListIn = {},
  ): Promise<ReportTemplateListOut> => {
    const requestBody: ReportTemplateListIn = {
      page: body.page ?? 1,
      page_size: body.page_size ?? 20,
      ...(body.name__ilike && { name__ilike: body.name__ilike }),
      ...(body.module_id && { module_id: body.module_id }),
      ...(body.is_active !== undefined &&
        body.is_active !== null && { is_active: body.is_active }),
    }
    return request<ReportTemplateListOut>(
      "/api/v1/report-modules/templates/list",
      { method: "POST", body: JSON.stringify(requestBody) },
    )
  },

  // --- Templates (scoped to module) ---

  listTemplates: async (
    moduleId: string,
    body: ReportTemplateListIn = {},
  ): Promise<ReportTemplateListOut> => {
    return request<ReportTemplateListOut>(
      `/api/v1/report-modules/${moduleId}/templates/list`,
      {
        method: "POST",
        body: JSON.stringify({ page: 1, page_size: 100, ...body }),
      },
    )
  },

  createTemplate: async (
    moduleId: string,
    body: ReportTemplateCreate,
  ): Promise<ReportTemplatePublic> => {
    return request<ReportTemplatePublic>(
      `/api/v1/report-modules/${moduleId}/templates/create`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    )
  },

  updateTemplate: async (
    moduleId: string,
    body: ReportTemplateUpdate & { id: string },
  ): Promise<ReportTemplatePublic> => {
    return request<ReportTemplatePublic>(
      `/api/v1/report-modules/${moduleId}/templates/update`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    )
  },

  deleteTemplate: async (
    moduleId: string,
    templateId: string,
  ): Promise<{ message: string }> => {
    return request<{ message: string }>(
      `/api/v1/report-modules/${moduleId}/templates/delete?tid=${templateId}`,
      { method: "POST" },
    )
  },

  getTemplate: async (
    moduleId: string,
    templateId: string,
  ): Promise<ReportTemplateDetail> => {
    return request<ReportTemplateDetail>(
      `/api/v1/report-modules/${moduleId}/templates/${templateId}`,
      { method: "GET" },
    )
  },

  // --- Template Clients ---

  getTemplateClients: async (
    moduleId: string,
    templateId: string,
  ): Promise<string[]> => {
    return request<string[]>(
      `/api/v1/report-modules/${moduleId}/templates/${templateId}/clients`,
      { method: "GET" },
    )
  },

  setTemplateClients: async (
    moduleId: string,
    templateId: string,
    clientIds: string[],
  ): Promise<{ client_ids: string[] }> => {
    return request<{ client_ids: string[] }>(
      `/api/v1/report-modules/${moduleId}/templates/${templateId}/clients`,
      {
        method: "POST",
        body: JSON.stringify({ client_ids: clientIds }),
      },
    )
  },

  // --- Mappings ---

  createMapping: async (
    moduleId: string,
    templateId: string,
    body: SheetMappingCreate,
  ): Promise<SheetMappingPublic> => {
    return request<SheetMappingPublic>(
      `/api/v1/report-modules/${moduleId}/templates/${templateId}/mappings/create`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    )
  },

  updateMapping: async (
    moduleId: string,
    templateId: string,
    body: SheetMappingUpdate,
  ): Promise<SheetMappingPublic> => {
    return request<SheetMappingPublic>(
      `/api/v1/report-modules/${moduleId}/templates/${templateId}/mappings/update`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    )
  },

  batchUpdateMappings: async (
    moduleId: string,
    templateId: string,
    mappings: SheetMappingUpdate[],
  ): Promise<SheetMappingPublic[]> => {
    return request<SheetMappingPublic[]>(
      `/api/v1/report-modules/${moduleId}/templates/${templateId}/mappings/batch-update`,
      {
        method: "POST",
        body: JSON.stringify({ mappings }),
      },
    )
  },

  deleteMapping: async (
    moduleId: string,
    templateId: string,
    mappingId: string,
  ): Promise<{ message: string }> => {
    return request<{ message: string }>(
      `/api/v1/report-modules/${moduleId}/templates/${templateId}/mappings/delete?mapping_id=${mappingId}`,
      { method: "POST" },
    )
  },

  // --- Generate ---

  generate: async (
    moduleId: string,
    templateId: string,
    body: GenerateReportIn = {},
  ): Promise<GenerateReportOut> => {
    return request<GenerateReportOut>(
      `/api/v1/report-modules/${moduleId}/templates/${templateId}/generate`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    )
  },

  // --- Preview (dry-run) ---

  preview: async (
    moduleId: string,
    templateId: string,
    body: ReportPreviewIn = {},
  ): Promise<ReportPreviewOut> => {
    return request<ReportPreviewOut>(
      `/api/v1/report-modules/${moduleId}/templates/${templateId}/preview`,
      {
        method: "POST",
        body: JSON.stringify({ row_limit: 5, ...body }),
      },
    )
  },

  // --- Template Executions ---

  listTemplateExecutions: async (
    moduleId: string,
    templateId: string,
    params: ReportExecutionListIn = {},
  ): Promise<ReportExecutionListOut> => {
    const qs = new URLSearchParams()
    if (params.page) qs.set("page", String(params.page))
    if (params.page_size) qs.set("page_size", String(params.page_size))
    if (params.status) qs.set("status", params.status)
    const query = qs.toString() ? `?${qs.toString()}` : ""
    return request<ReportExecutionListOut>(
      `/api/v1/report-modules/${moduleId}/templates/${templateId}/executions${query}`,
      { method: "GET" },
    )
  },
}

// ---------- Global Executions Service ----------

export const ReportExecutionsService = {
  get: async (executionId: string): Promise<ReportExecutionPublic> => {
    return request<ReportExecutionPublic>(
      `/api/v1/report-executions/${executionId}`,
      { method: "GET" },
    )
  },

  list: async (
    params: ReportExecutionListIn = {},
  ): Promise<ReportExecutionListOut> => {
    const qs = new URLSearchParams()
    if (params.page) qs.set("page", String(params.page))
    if (params.page_size) qs.set("page_size", String(params.page_size))
    if (params.status) qs.set("status", params.status)
    if (params.module_id) qs.set("module_id", params.module_id)
    if (params.template_id) qs.set("template_id", params.template_id)
    const query = qs.toString() ? `?${qs.toString()}` : ""
    return request<ReportExecutionListOut>(
      `/api/v1/report-executions${query}`,
      { method: "GET" },
    )
  },
}
