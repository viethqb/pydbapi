import { api } from "./apiClient.ts"

export type ApiModuleRecord = {
  id: string
  name: string
  description: string | null
  is_active: boolean
}

export async function createApiModule(
  name: string,
  description: string | null = null,
): Promise<ApiModuleRecord> {
  return api.post<ApiModuleRecord>("/api/v1/modules/create", {
    name,
    description,
    is_active: true,
  })
}

export async function deleteApiModule(id: string): Promise<void> {
  await api.delete(`/api/v1/modules/delete/${id}`)
}
