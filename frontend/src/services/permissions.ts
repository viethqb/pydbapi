import { request } from "@/lib/api-request"

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
    return request<PermissionListOut>("/api/v1/permissions/list")
  },

  getResourceNames(): Promise<ResourceNamesOut> {
    return request<ResourceNamesOut>("/api/v1/permissions/resource-names")
  },
}
