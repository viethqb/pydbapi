import { api } from "./apiClient.ts"

export type AppClientRecord = {
  id: string
  name: string
  client_id: string
  is_active: boolean
}

export async function deleteAppClient(id: string): Promise<void> {
  await api.delete(`/api/v1/clients/delete/${id}`)
}

export async function deleteAppClientsMatching(prefix: string): Promise<void> {
  const res = await api.post<{ data: Array<{ id: string; name: string }> }>(
    "/api/v1/clients/list",
    { page: 1, page_size: 100 },
  )
  await Promise.all(
    res.data
      .filter((c) => c.name.startsWith(prefix))
      .map((c) => deleteAppClient(c.id).catch(() => {})),
  )
}
