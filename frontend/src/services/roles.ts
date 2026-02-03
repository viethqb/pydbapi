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

export type RolePublic = {
  id: string
  name: string
  description: string | null
  user_count?: number
}

export type RoleDetail = RolePublic & {
  permission_ids: string[]
  user_count: number
}

export type RoleUpdateIn = {
  name?: string | null
  description?: string | null
  permission_ids?: string[] | null
}

export type RoleListOut = { data: RolePublic[] }
export type RoleDetailOut = RoleDetail

export type UserPublic = {
  id: string
  email: string
  full_name: string | null
  is_active?: boolean
  is_superuser?: boolean
}
export type RoleUsersOut = { data: UserPublic[] }

export type RoleCreateIn = {
  name: string
  description?: string | null
  permission_ids?: string[]
}

export const RolesService = {
  list(): Promise<RoleListOut> {
    return request<RoleListOut>("/roles/list")
  },

  create(body: RoleCreateIn): Promise<RoleDetailOut> {
    return request<RoleDetailOut>("/roles", {
      method: "POST",
      body: JSON.stringify({
        name: body.name,
        description: body.description ?? null,
        permission_ids: body.permission_ids ?? [],
      }),
    })
  },

  get(id: string): Promise<RoleDetailOut> {
    return request<RoleDetailOut>(`/roles/${id}`)
  },

  /** List users assigned to this role. Admin only. */
  getRoleUsers(roleId: string): Promise<RoleUsersOut> {
    return request<RoleUsersOut>(`/roles/${roleId}/users`)
  },

  update(id: string, body: RoleUpdateIn): Promise<RoleDetailOut> {
    return request<RoleDetailOut>(`/roles/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    })
  },

  async delete(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}${PREFIX}/roles/${id}`, {
      method: "DELETE",
      headers: await (async () => {
        let token: string | null = null
        if (OpenAPI.TOKEN) {
          token =
            typeof OpenAPI.TOKEN === "function"
              ? await OpenAPI.TOKEN({} as { url: string })
              : OpenAPI.TOKEN
        }
        return {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        }
      })(),
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
    // 204 No Content has no body
  },
}
