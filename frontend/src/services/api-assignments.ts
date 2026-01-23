import { OpenAPI } from "@/client"

// Types matching backend schemas
export type HttpMethodEnum = "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
export type ExecuteEngineEnum = "SQL" | "SCRIPT"

export type ApiAccessTypeEnum = "public" | "private"

export type ApiAssignmentPublic = {
  id: string
  module_id: string
  name: string
  path: string
  http_method: HttpMethodEnum
  execute_engine: ExecuteEngineEnum
  datasource_id: string | null
  description: string | null
  is_published: boolean
  access_type: ApiAccessTypeEnum
  sort_order: number
  created_at: string
  updated_at: string
}

export type ApiContextPublic = {
  id: string
  api_assignment_id: string
  content: string
  params: ApiParameter[] | null
  created_at: string
  updated_at: string
}

export type ApiAssignmentDetail = ApiAssignmentPublic & {
  api_context: ApiContextPublic | null
  group_ids: string[]
}

export type ApiAssignmentListIn = {
  page?: number
  page_size?: number
  module_id?: string | null
  is_published?: boolean | null
  name__ilike?: string | null
  http_method?: HttpMethodEnum | null
  execute_engine?: ExecuteEngineEnum | null
}

export type ApiAssignmentListOut = {
  data: ApiAssignmentPublic[]
  total: number
}

export type ApiParameter = {
  name: string
  location: "query" | "header" | "body"
  data_type?: string | null
  is_required?: boolean
  validate_type?: "regex" | "python" | null
  validate?: string | null
}

export type ApiAssignmentCreate = {
  module_id: string
  name: string
  path: string
  http_method: HttpMethodEnum
  execute_engine: ExecuteEngineEnum
  datasource_id?: string | null
  description?: string | null
  access_type?: ApiAccessTypeEnum
  sort_order?: number
  content?: string | null
  group_ids?: string[]
  params?: ApiParameter[]
}

export type ApiAssignmentUpdate = {
  id: string
  module_id?: string | null
  name?: string | null
  path?: string | null
  http_method?: HttpMethodEnum | null
  execute_engine?: ExecuteEngineEnum | null
  datasource_id?: string | null
  description?: string | null
  access_type?: ApiAccessTypeEnum | null
  sort_order?: number | null
  content?: string | null
  group_ids?: string[] | null
  params?: ApiParameter[] | null
}

export type ApiAssignmentPublishIn = {
  id: string
}

export type ApiAssignmentDebugIn = {
  id?: string | null
  content?: string | null
  execute_engine?: ExecuteEngineEnum | null
  datasource_id?: string | null
  params?: Record<string, unknown>
}

export type ApiAssignmentDebugOut = {
  data?: unknown
  rowcount?: number
  error?: string
}

const API_BASE = OpenAPI.BASE || import.meta.env.VITE_API_URL || "http://localhost:8000"

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
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
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || `HTTP error! status: ${response.status}`)
  }

  return response.json()
}

export const ApiAssignmentsService = {
  list: async (body: ApiAssignmentListIn): Promise<ApiAssignmentListOut> => {
    return request<ApiAssignmentListOut>("/api/v1/api-assignments/list", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  create: async (body: ApiAssignmentCreate): Promise<ApiAssignmentPublic> => {
    return request<ApiAssignmentPublic>("/api/v1/api-assignments/create", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  update: async (body: ApiAssignmentUpdate): Promise<ApiAssignmentPublic> => {
    return request<ApiAssignmentPublic>("/api/v1/api-assignments/update", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  delete: async (id: string): Promise<{ message: string }> => {
    return request<{ message: string }>(`/api/v1/api-assignments/delete/${id}`, {
      method: "DELETE",
    })
  },

  get: async (id: string): Promise<ApiAssignmentDetail> => {
    return request<ApiAssignmentDetail>(`/api/v1/api-assignments/${id}`, {
      method: "GET",
    })
  },

  publish: async (body: ApiAssignmentPublishIn): Promise<ApiAssignmentPublic> => {
    return request<ApiAssignmentPublic>("/api/v1/api-assignments/publish", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  unpublish: async (body: ApiAssignmentPublishIn): Promise<ApiAssignmentPublic> => {
    return request<ApiAssignmentPublic>("/api/v1/api-assignments/unpublish", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  debug: async (body: ApiAssignmentDebugIn): Promise<ApiAssignmentDebugOut> => {
    return request<ApiAssignmentDebugOut>("/api/v1/api-assignments/debug", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
}
