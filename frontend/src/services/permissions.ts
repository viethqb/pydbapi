import { OpenAPI } from "@/client"

const API_BASE =
  OpenAPI.BASE || import.meta.env.VITE_API_URL || "http://localhost:8000"
const PREFIX = "/api/v1"

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
  const response = await fetch(`${API_BASE}${PREFIX}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string>),
    },
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: response.statusText }))
    throw new Error(
      (error as { detail?: string }).detail ||
        `HTTP error! status: ${response.status}`,
    )
  }

  return response.json()
}

export type PermissionPublic = {
  id: string
  resource_type: string
  action: string
  resource_id: string | null
}

export type PermissionListOut = { data: PermissionPublic[] }

export type ResourceName = { id: string; name: string }

export type ResourceNamesOut = {
  datasources: ResourceName[]
  modules: ResourceName[]
  api_assignments: ResourceName[]
  groups: ResourceName[]
  macro_defs: ResourceName[]
  clients: ResourceName[]
}

export const PermissionsService = {
  list(): Promise<PermissionListOut> {
    return request<PermissionListOut>("/permissions/list")
  },

  getResourceNames(): Promise<ResourceNamesOut> {
    return request<ResourceNamesOut>("/permissions/resource-names")
  },
}
