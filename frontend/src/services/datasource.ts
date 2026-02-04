import { OpenAPI } from "@/client"
import type { DataSourcePublic } from "@/components/DataSource/columns"

// Types matching backend schemas
export type ProductTypeEnum = "postgres" | "mysql"

export type DataSourceListIn = {
  page?: number
  page_size?: number
  product_type?: ProductTypeEnum | null
  is_active?: boolean | null
  name__ilike?: string | null
}

export type DataSourceListOut = {
  data: DataSourcePublic[]
  total: number
}

export type DataSourceCreate = {
  name: string
  product_type: ProductTypeEnum
  host: string
  port?: number
  database: string
  username: string
  password: string
  driver_version?: string | null
  description?: string | null
  is_active?: boolean
  close_connection_after_execute?: boolean
}

export type DataSourceUpdate = {
  id: string
  name?: string | null
  product_type?: ProductTypeEnum | null
  host?: string | null
  port?: number | null
  database?: string | null
  username?: string | null
  password?: string | null
  driver_version?: string | null
  description?: string | null
  is_active?: boolean | null
  close_connection_after_execute?: boolean | null
}

export type DataSourcePreTestIn = {
  product_type: ProductTypeEnum
  host: string
  port?: number
  database: string
  username: string
  password: string
}

export type DataSourceTestResult = {
  ok: boolean
  message: string
}

const API_BASE = OpenAPI.BASE || import.meta.env.VITE_API_URL || "http://localhost:8000"

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  let token: string | null = null
  if (OpenAPI.TOKEN) {
    if (typeof OpenAPI.TOKEN === "function") {
      token = await OpenAPI.TOKEN({} as any)
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

export const DataSourceService = {
  list: async (body: DataSourceListIn = {}): Promise<DataSourceListOut> => {
    const requestBody: DataSourceListIn = {
      page: body.page ?? 1,
      page_size: body.page_size ?? 20,
      ...(body.product_type !== undefined && body.product_type !== null && { product_type: body.product_type }),
      ...(body.is_active !== undefined && body.is_active !== null && { is_active: body.is_active }),
      ...(body.name__ilike !== undefined && body.name__ilike !== null && body.name__ilike !== "" && { name__ilike: body.name__ilike }),
    }
    return request<DataSourceListOut>("/api/v1/datasources/list", {
      method: "POST",
      body: JSON.stringify(requestBody),
    })
  },

  create: async (body: DataSourceCreate): Promise<DataSourcePublic> => {
    return request<DataSourcePublic>("/api/v1/datasources/create", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  update: async (body: DataSourceUpdate): Promise<DataSourcePublic> => {
    return request<DataSourcePublic>("/api/v1/datasources/update", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  delete: async (id: string): Promise<{ message: string }> => {
    return request<{ message: string }>(`/api/v1/datasources/delete/${id}`, {
      method: "DELETE",
    })
  },

  get: async (id: string): Promise<DataSourcePublic> => {
    return request<DataSourcePublic>(`/api/v1/datasources/${id}`, {
      method: "GET",
    })
  },

  test: async (id: string): Promise<DataSourceTestResult> => {
    return request<DataSourceTestResult>(`/api/v1/datasources/test/${id}`, {
      method: "GET",
    })
  },

  preTest: async (body: DataSourcePreTestIn): Promise<DataSourceTestResult> => {
    return request<DataSourceTestResult>("/api/v1/datasources/preTest", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  getTypes: async (): Promise<string[]> => {
    return request<string[]>("/api/v1/datasources/types", {
      method: "GET",
    })
  },
}
