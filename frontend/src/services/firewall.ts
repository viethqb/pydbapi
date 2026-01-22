import { OpenAPI } from "@/client"

// Types matching backend schemas
export type FirewallRuleTypeEnum = "allow" | "deny"

export type FirewallRulePublic = {
  id: string
  rule_type: FirewallRuleTypeEnum
  ip_range: string
  description: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type FirewallRuleListIn = {
  page?: number
  page_size?: number
  rule_type?: FirewallRuleTypeEnum | null
  is_active?: boolean | null
}

export type FirewallRuleListOut = {
  data: FirewallRulePublic[]
  total: number
}

export type FirewallRuleCreate = {
  rule_type: FirewallRuleTypeEnum
  ip_range: string
  description?: string | null
  is_active?: boolean
  sort_order?: number
}

export type FirewallRuleUpdate = {
  id: string
  rule_type?: FirewallRuleTypeEnum | null
  ip_range?: string | null
  description?: string | null
  is_active?: boolean | null
  sort_order?: number | null
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

export const FirewallService = {
  list: async (body: FirewallRuleListIn = {}): Promise<FirewallRuleListOut> => {
    const requestBody: FirewallRuleListIn = {
      page: body.page ?? 1,
      page_size: body.page_size ?? 20,
      ...(body.rule_type !== undefined && body.rule_type !== null && { rule_type: body.rule_type }),
      ...(body.is_active !== undefined && body.is_active !== null && { is_active: body.is_active }),
    }
    return request<FirewallRuleListOut>("/api/v1/firewall/list", {
      method: "POST",
      body: JSON.stringify(requestBody),
    })
  },

  create: async (body: FirewallRuleCreate): Promise<FirewallRulePublic> => {
    return request<FirewallRulePublic>("/api/v1/firewall/create", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  update: async (body: FirewallRuleUpdate): Promise<FirewallRulePublic> => {
    return request<FirewallRulePublic>("/api/v1/firewall/update", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  delete: async (id: string): Promise<{ message: string }> => {
    return request<{ message: string }>(`/api/v1/firewall/delete/${id}`, {
      method: "DELETE",
    })
  },

  get: async (id: string): Promise<FirewallRulePublic> => {
    return request<FirewallRulePublic>(`/api/v1/firewall/${id}`, {
      method: "GET",
    })
  },
}
