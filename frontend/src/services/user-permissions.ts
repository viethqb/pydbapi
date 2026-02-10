import { request, type RequestOptions } from "@/lib/api-request"

export type PermissionItem = {
  resource_type: string
  action: string
  resource_id?: string | null
}
export type MyPermissionsOut = { data: PermissionItem[] }

export type UserRolesOut = { user_id: string; role_ids: string[] }

type Opts = Pick<RequestOptions, "signal">

export const UserPermissionsService = {
  /** Current user's permissions (from roles). */
  getMyPermissions(opts?: Opts): Promise<MyPermissionsOut> {
    return request<MyPermissionsOut>("/api/v1/users/me/permissions", {
      signal: opts?.signal,
    })
  },

  /** Get roles assigned to a user. Admin only. */
  getUserRoles(userId: string): Promise<UserRolesOut> {
    return request<UserRolesOut>(`/api/v1/users/${userId}/roles`)
  },

  /** Replace roles for a user. Admin only. */
  updateUserRoles(userId: string, roleIds: string[]): Promise<UserRolesOut> {
    return request<UserRolesOut>(`/api/v1/users/${userId}/roles`, {
      method: "PUT",
      body: JSON.stringify({ role_ids: roleIds }),
    })
  },
}
