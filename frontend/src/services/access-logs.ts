import { OpenAPI } from "@/client"

export type AccessLogConfigPublic = {
  datasource_id: string | null
  use_starrocks_audit: boolean
}

export type AccessLogDatasourceOption = {
  id: string
  name: string
  product_type: string
}

export type AccessLogDatasourceOptionsOut = {
  data: AccessLogDatasourceOption[]
}

export type AccessRecordPublic = {
  id: string
  api_assignment_id: string | null
  app_client_id: string | null
  ip_address: string
  http_method: string
  path: string
  status_code: number
  created_at: string
  request_body?: string | null
  request_headers?: string | null
  request_params?: string | null
}

export type AccessRecordDetail = AccessRecordPublic & {
  request_body: string | null
  request_headers?: string | null
  request_params?: string | null
  api_display?: string | null
  app_client_display?: string | null
}

export type AccessLogListOut = {
  data: AccessRecordPublic[]
  total: number
}

const API_BASE = OpenAPI.BASE || import.meta.env.VITE_API_URL || "http://localhost:8000"

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  let token: string | null = null
  if (OpenAPI.TOKEN) {
    if (typeof OpenAPI.TOKEN === "function") {
      token = await OpenAPI.TOKEN({} as { url: string })
    } else {
      token = OpenAPI.TOKEN
    }
  }
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: response.statusText }))
    throw new Error((error as { detail?: string }).detail || `HTTP error! status: ${response.status}`)
  }
  return response.json()
}

export const AccessLogsService = {
  getConfig: async (): Promise<AccessLogConfigPublic> => {
    return request<AccessLogConfigPublic>("/api/v1/access-logs/config", { method: "GET" })
  },

  getDatasourceOptions: async (): Promise<AccessLogDatasourceOptionsOut> => {
    return request<AccessLogDatasourceOptionsOut>(
      "/api/v1/access-logs/datasource-options",
      { method: "GET" },
    )
  },

  putConfig: async (body: {
    datasource_id: string | null
    use_starrocks_audit?: boolean
  }): Promise<AccessLogConfigPublic> => {
    return request<AccessLogConfigPublic>("/api/v1/access-logs/config", {
      method: "PUT",
      body: JSON.stringify(body),
    })
  },

  list: async (params: {
    api_assignment_id?: string | null
    module_id?: string | null
    group_id?: string | null
    app_client_id?: string | null
    path__ilike?: string | null
    http_method?: string | null
    ip_address?: string | null
    time_from?: string | null
    time_to?: string | null
    status?: string | null
    page?: number
    page_size?: number
  } = {}): Promise<AccessLogListOut> => {
    const sp = new URLSearchParams()
    if (params.api_assignment_id != null && params.api_assignment_id !== "")
      sp.set("api_assignment_id", params.api_assignment_id)
    if (params.module_id != null && params.module_id !== "")
      sp.set("module_id", params.module_id)
    if (params.group_id != null && params.group_id !== "")
      sp.set("group_id", params.group_id)
    if (params.app_client_id != null && params.app_client_id !== "")
      sp.set("app_client_id", params.app_client_id)
    if (params.path__ilike != null && params.path__ilike !== "")
      sp.set("path__ilike", params.path__ilike)
    if (params.http_method != null && params.http_method !== "")
      sp.set("http_method", params.http_method)
    if (params.ip_address != null && params.ip_address !== "")
      sp.set("ip_address", params.ip_address)
    if (params.time_from != null && params.time_from !== "") sp.set("time_from", params.time_from)
    if (params.time_to != null && params.time_to !== "") sp.set("time_to", params.time_to)
    if (params.status != null && params.status !== "") sp.set("status", params.status)
    if (params.page != null) sp.set("page", String(params.page))
    if (params.page_size != null) sp.set("page_size", String(params.page_size))
    const q = sp.toString()
    return request<AccessLogListOut>(
      `/api/v1/access-logs${q ? `?${q}` : ""}`,
      { method: "GET" },
    )
  },

  getDetail: async (logId: string): Promise<AccessRecordDetail> => {
    return request<AccessRecordDetail>(`/api/v1/access-logs/${logId}`, { method: "GET" })
  },

  initExternalTable: async (): Promise<{ message: string }> => {
    return request<{ message: string }>("/api/v1/access-logs/init-external-table", {
      method: "POST",
    })
  },
}
