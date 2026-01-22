import { OpenAPI } from "@/client"

// Types matching backend schemas
export type UnifyAlarmPublic = {
  id: string
  name: string
  alarm_type: string
  config: Record<string, any>
  is_enabled: boolean
  created_at: string
  updated_at: string
}

export type UnifyAlarmListIn = {
  page?: number
  page_size?: number
  alarm_type?: string | null
  is_enabled?: boolean | null
}

export type UnifyAlarmListOut = {
  data: UnifyAlarmPublic[]
  total: number
}

export type UnifyAlarmCreate = {
  name: string
  alarm_type: string
  config?: Record<string, any>
  is_enabled?: boolean
}

export type UnifyAlarmUpdate = {
  id: string
  name?: string | null
  alarm_type?: string | null
  config?: Record<string, any> | null
  is_enabled?: boolean | null
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

export const AlarmService = {
  list: async (body: UnifyAlarmListIn = {}): Promise<UnifyAlarmListOut> => {
    const requestBody: UnifyAlarmListIn = {
      page: body.page ?? 1,
      page_size: body.page_size ?? 20,
      ...(body.alarm_type !== undefined && body.alarm_type !== null && body.alarm_type !== "" && { alarm_type: body.alarm_type }),
      ...(body.is_enabled !== undefined && body.is_enabled !== null && { is_enabled: body.is_enabled }),
    }
    return request<UnifyAlarmListOut>("/api/v1/alarm/list", {
      method: "POST",
      body: JSON.stringify(requestBody),
    })
  },

  create: async (body: UnifyAlarmCreate): Promise<UnifyAlarmPublic> => {
    return request<UnifyAlarmPublic>("/api/v1/alarm/create", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  update: async (body: UnifyAlarmUpdate): Promise<UnifyAlarmPublic> => {
    return request<UnifyAlarmPublic>("/api/v1/alarm/update", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  delete: async (id: string): Promise<{ message: string }> => {
    return request<{ message: string }>(`/api/v1/alarm/delete/${id}`, {
      method: "DELETE",
    })
  },

  get: async (id: string): Promise<UnifyAlarmPublic> => {
    return request<UnifyAlarmPublic>(`/api/v1/alarm/${id}`, {
      method: "GET",
    })
  },
}
