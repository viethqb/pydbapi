import { request } from "@/lib/api-request"

// Types matching backend schemas
export type AppClientPublic = {
  id: string
  name: string
  client_id: string
  description: string | null
  rate_limit_per_minute: number | null
  max_concurrent: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AppClientDetail = AppClientPublic & {
  group_ids: string[]
  api_assignment_ids: string[]
  /** Union of direct api_assignment_ids + APIs reachable via assigned groups. Matches gateway auth logic. */
  effective_api_assignment_ids: string[]
}

export type AppClientListIn = {
  page?: number
  page_size?: number
  name__ilike?: string | null
  is_active?: boolean | null
}

export type AppClientListOut = {
  data: AppClientPublic[]
  total: number
}

export type AppClientCreate = {
  name: string
  client_id?: string
  client_secret: string
  description?: string | null
  rate_limit_per_minute?: number | null
  max_concurrent?: number | null
  is_active?: boolean
  group_ids?: string[] | null
  api_assignment_ids?: string[] | null
}

export type AppClientUpdate = {
  id: string
  name?: string | null
  description?: string | null
  rate_limit_per_minute?: number | null
  max_concurrent?: number | null
  is_active?: boolean | null
  group_ids?: string[] | null
  api_assignment_ids?: string[] | null
}

export type AppClientRegenerateSecretOut = {
  message: string
  client_secret: string
}

export const ClientsService = {
  list: async (body: AppClientListIn = {}): Promise<AppClientListOut> => {
    const requestBody: AppClientListIn = {
      page: body.page ?? 1,
      page_size: body.page_size ?? 20,
      ...(body.name__ilike !== undefined && body.name__ilike !== null && body.name__ilike !== "" && { name__ilike: body.name__ilike }),
      ...(body.is_active !== undefined && body.is_active !== null && { is_active: body.is_active }),
    }
    return request<AppClientListOut>("/api/v1/clients/list", {
      method: "POST",
      body: JSON.stringify(requestBody),
    })
  },

  create: async (body: AppClientCreate): Promise<AppClientPublic> => {
    return request<AppClientPublic>("/api/v1/clients/create", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  update: async (body: AppClientUpdate): Promise<AppClientPublic> => {
    return request<AppClientPublic>("/api/v1/clients/update", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  delete: async (id: string): Promise<{ message: string }> => {
    return request<{ message: string }>(`/api/v1/clients/delete/${id}`, {
      method: "DELETE",
    })
  },

  get: async (id: string): Promise<AppClientDetail> => {
    return request<AppClientDetail>(`/api/v1/clients/${id}`, {
      method: "GET",
    })
  },

  regenerateSecret: async (id: string): Promise<AppClientRegenerateSecretOut> => {
    return request<AppClientRegenerateSecretOut>(`/api/v1/clients/${id}/regenerate-secret`, {
      method: "POST",
    })
  },
}
