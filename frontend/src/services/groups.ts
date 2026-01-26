import { OpenAPI } from "@/client"

// Types matching backend schemas
export type ApiGroupPublic = {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ApiGroupDetail = ApiGroupPublic & {
  api_assignment_ids: string[]
}

export type ApiGroupListIn = {
  page?: number
  page_size?: number
  name__ilike?: string | null
  is_active?: boolean | null
}

export type ApiGroupListOut = {
  data: ApiGroupPublic[]
  total: number
}

export type ApiGroupCreate = {
  name: string
  description?: string | null
  is_active?: boolean
}

export type ApiGroupUpdate = {
  id: string
  name?: string | null
  description?: string | null
  is_active?: boolean | null
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

export const GroupsService = {
  list: async (body: ApiGroupListIn = {}): Promise<ApiGroupListOut> => {
    const requestBody: ApiGroupListIn = {
      page: body.page ?? 1,
      page_size: body.page_size ?? 20,
      ...(body.name__ilike !== undefined && body.name__ilike !== null && body.name__ilike !== "" && { name__ilike: body.name__ilike }),
      ...(body.is_active !== undefined && body.is_active !== null && { is_active: body.is_active }),
    }
    return request<ApiGroupListOut>("/api/v1/groups/list", {
      method: "POST",
      body: JSON.stringify(requestBody),
    })
  },

  create: async (body: ApiGroupCreate): Promise<ApiGroupPublic> => {
    return request<ApiGroupPublic>("/api/v1/groups/create", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  update: async (body: ApiGroupUpdate): Promise<ApiGroupPublic> => {
    return request<ApiGroupPublic>("/api/v1/groups/update", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  delete: async (id: string): Promise<{ message: string }> => {
    return request<{ message: string }>(`/api/v1/groups/delete/${id}`, {
      method: "DELETE",
    })
  },

  get: async (id: string): Promise<ApiGroupDetail> => {
    return request<ApiGroupDetail>(`/api/v1/groups/${id}`, {
      method: "GET",
    })
  },
}
