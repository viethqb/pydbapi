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

export type PermissionItem = {
  resource_type: string
  action: string
  resource_id?: string | null
}
export type MyPermissionsOut = { data: PermissionItem[] }

export type UserRolesOut = { user_id: string; role_ids: string[] }

export const UserPermissionsService = {
  /** Current user's permissions (from roles). */
  getMyPermissions(): Promise<MyPermissionsOut> {
    return request<MyPermissionsOut>("/users/me/permissions")
  },

  /** Get roles assigned to a user. Admin only. */
  getUserRoles(userId: string): Promise<UserRolesOut> {
    return request<UserRolesOut>(`/users/${userId}/roles`)
  },

  /** Replace roles for a user. Admin only. */
  updateUserRoles(userId: string, roleIds: string[]): Promise<UserRolesOut> {
    return request<UserRolesOut>(`/users/${userId}/roles`, {
      method: "PUT",
      body: JSON.stringify({ role_ids: roleIds }),
    })
  },
}
