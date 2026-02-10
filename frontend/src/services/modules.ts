import { request } from "@/lib/api-request"

// Types matching backend schemas
export type ApiModulePublic = {
  id: string
  name: string
  description: string | null
  path_prefix: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ApiModuleListIn = {
  page?: number
  page_size?: number
  name__ilike?: string | null
  is_active?: boolean | null
}

export type ApiModuleListOut = {
  data: ApiModulePublic[]
  total: number
}

export type ApiModuleCreate = {
  name: string
  description?: string | null
  path_prefix?: string
  sort_order?: number
  is_active?: boolean
}

export type ApiModuleUpdate = {
  id: string
  name?: string | null
  description?: string | null
  path_prefix?: string | null
  sort_order?: number | null
  is_active?: boolean | null
}

export const ModulesService = {
  list: async (body: ApiModuleListIn): Promise<ApiModuleListOut> => {
    return request<ApiModuleListOut>("/api/v1/modules/list", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  listSimple: async (): Promise<ApiModulePublic[]> => {
    return request<ApiModulePublic[]>("/api/v1/modules", {
      method: "GET",
    })
  },

  create: async (body: ApiModuleCreate): Promise<ApiModulePublic> => {
    return request<ApiModulePublic>("/api/v1/modules/create", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  update: async (body: ApiModuleUpdate): Promise<ApiModulePublic> => {
    return request<ApiModulePublic>("/api/v1/modules/update", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  delete: async (id: string): Promise<{ message: string }> => {
    return request<{ message: string }>(`/api/v1/modules/delete/${id}`, {
      method: "DELETE",
    })
  },

  get: async (id: string): Promise<ApiModulePublic> => {
    return request<ApiModulePublic>(`/api/v1/modules/${id}`, {
      method: "GET",
    })
  },
}
