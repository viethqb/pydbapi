/**
 * Gateway runtime — the golden path of the product:
 *   DataSource → ApiModule → ApiAssignment (SQL) → createVersion →
 *   publish → GET /api/{path} returns SQL result.
 *
 * Uses public access type to skip the token dance.
 */
import { api } from "./utils/apiClient.ts"
import { createApiModule, deleteApiModule } from "./utils/apiModule.ts"
import {
  createDataSource,
  deleteDataSource,
  deleteDataSourcesMatching,
} from "./utils/datasource.ts"
import { expect, test } from "./utils/fixtures.ts"

test.describe.configure({ mode: "serial" })

const API_BASE =
  process.env.PLAYWRIGHT_API_URL ||
  process.env.VITE_API_URL ||
  "http://localhost:8000"

const MOD_PREFIX = "e2e-gw-mod-"
const DS_PREFIX = "e2e-gw-ds-"
const PATH_PREFIX = "e2e-gw-"

let datasourceId: string
let moduleId: string
let assignmentId: string
let apiPath: string

async function cleanupApis() {
  const res = await api.post<{ data: Array<{ id: string; path: string }> }>(
    "/api/v1/api-assignments/list",
    { page: 1, page_size: 200 },
  )
  await Promise.all(
    res.data
      .filter((a) => a.path.startsWith(PATH_PREFIX))
      .map((a) =>
        api.delete(`/api/v1/api-assignments/delete/${a.id}`).catch(() => {}),
      ),
  )
}

async function cleanupModules() {
  const res = await api.post<{ data: Array<{ id: string; name: string }> }>(
    "/api/v1/modules/list",
    { page: 1, page_size: 100 },
  )
  await Promise.all(
    res.data
      .filter((m) => m.name.startsWith(MOD_PREFIX))
      .map((m) => deleteApiModule(m.id).catch(() => {})),
  )
}

test.beforeAll(async () => {
  await cleanupApis()
  await cleanupModules()
  await deleteDataSourcesMatching(DS_PREFIX)

  const ds = await createDataSource({ name: `${DS_PREFIX}${Date.now()}` })
  datasourceId = ds.id

  const mod = await createApiModule(
    `${MOD_PREFIX}${Date.now()}`,
    "gateway spec",
  )
  moduleId = mod.id

  apiPath = `${PATH_PREFIX}${Date.now()}`
  const assignment = await api.post<{ id: string }>(
    "/api/v1/api-assignments/create",
    {
      module_id: moduleId,
      name: apiPath,
      path: apiPath,
      http_method: "GET",
      execute_engine: "SQL",
      datasource_id: datasourceId,
      access_type: "public",
      content: "SELECT 1 AS ok, 'hello' AS greeting",
      params: [],
      param_validates: [],
      group_ids: [],
    },
  )
  assignmentId = assignment.id

  // Snapshot current draft as version v1, then publish that version.
  const version = await api.post<{ id: string }>(
    `/api/v1/api-assignments/${assignmentId}/versions/create`,
    { commit_message: "initial" },
  )
  await api.post("/api/v1/api-assignments/publish", {
    id: assignmentId,
    version_id: version.id,
  })
})

test.afterAll(async () => {
  await api
    .delete(`/api/v1/api-assignments/delete/${assignmentId}`)
    .catch(() => {})
  await deleteApiModule(moduleId).catch(() => {})
  await deleteDataSource(datasourceId).catch(() => {})
})

test("published public SQL API returns the query result via the gateway", async () => {
  // Hit the dynamic gateway directly (not via Vite proxy): no auth needed
  // because access_type="public".
  const res = await fetch(`${API_BASE}/api/${apiPath}`)
  expect(res.status).toBe(200)

  const body = (await res.json()) as {
    data?: unknown
    success?: boolean
    [k: string]: unknown
  }

  // Gateway wraps SQL rows in the standard response envelope. Flatten any
  // shape to a list of rows so we can assert the row we expect.
  const rows =
    (Array.isArray(body) ? body : undefined) ??
    (Array.isArray(body.data) ? (body.data as unknown[]) : undefined) ??
    (body.data && typeof body.data === "object"
      ? ((body.data as Record<string, unknown>).data as unknown[])
      : undefined)

  expect(Array.isArray(rows)).toBe(true)
  const first = (rows as Array<Record<string, unknown>>)[0]
  expect(first).toMatchObject({ ok: 1, greeting: "hello" })
})

test("unpublished path returns 404 from the gateway", async () => {
  const res = await fetch(`${API_BASE}/api/${PATH_PREFIX}does-not-exist`)
  expect(res.status).toBe(404)
})
