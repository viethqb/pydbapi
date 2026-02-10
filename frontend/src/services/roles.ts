import { request, requestNoContent } from "@/lib/api-request"

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
    return request<RoleListOut>("/api/v1/roles/list")
  },

  create(body: RoleCreateIn): Promise<RoleDetailOut> {
    return request<RoleDetailOut>("/api/v1/roles", {
      method: "POST",
      body: JSON.stringify({
        name: body.name,
        description: body.description ?? null,
        permission_ids: body.permission_ids ?? [],
      }),
    })
  },

  get(id: string): Promise<RoleDetailOut> {
    return request<RoleDetailOut>(`/api/v1/roles/${id}`)
  },

  /** List users assigned to this role. Admin only. */
  getRoleUsers(roleId: string): Promise<RoleUsersOut> {
    return request<RoleUsersOut>(`/api/v1/roles/${roleId}/users`)
  },

  update(id: string, body: RoleUpdateIn): Promise<RoleDetailOut> {
    return request<RoleDetailOut>(`/api/v1/roles/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    })
  },

  async delete(id: string): Promise<void> {
    return requestNoContent(`/api/v1/roles/${id}`, { method: "DELETE" })
  },
}
