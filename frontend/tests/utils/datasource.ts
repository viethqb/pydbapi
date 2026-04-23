import { api } from "./apiClient.ts"

export type DataSourceRecord = {
  id: string
  name: string
  product_type: string
  host: string
  port: number
  database: string
  username: string
  is_active: boolean
}

export type CreateDataSourceInput = {
  name: string
  product_type?: "postgres" | "mysql" | "trino" | "minio"
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
  description?: string | null
}

export async function createDataSource(
  input: CreateDataSourceInput,
): Promise<DataSourceRecord> {
  return api.post<DataSourceRecord>("/api/v1/datasources/create", {
    name: input.name,
    product_type: input.product_type ?? "postgres",
    host: input.host ?? "localhost",
    port: input.port ?? 5432,
    database: input.database ?? "app",
    username: input.username ?? "postgres",
    // Default to the real Postgres password from .env so the SQL engine can
    // actually connect; individual tests can still override.
    password: input.password ?? process.env.POSTGRES_PASSWORD ?? "postgres",
    description: input.description ?? null,
    is_active: true,
  })
}

export async function deleteDataSource(id: string): Promise<void> {
  await api.delete(`/api/v1/datasources/delete/${id}`)
}

export async function deleteDataSourcesMatching(prefix: string): Promise<void> {
  const res = await api.post<{ data: Array<{ id: string; name: string }> }>(
    "/api/v1/datasources/list",
    { page: 1, page_size: 100 },
  )
  await Promise.all(
    res.data
      .filter((d) => d.name.startsWith(prefix))
      .map((d) => deleteDataSource(d.id).catch(() => {})),
  )
}
