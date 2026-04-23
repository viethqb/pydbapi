/**
 * Gateway full-surface E2E. Covers:
 *   - Query / body / path parameter passing into Jinja2 SQL.
 *   - Required-param validation (400).
 *   - Default values.
 *   - Unpublished APIs return 404.
 *   - Wrong HTTP method returns 404.
 *   - Python SCRIPT engine.
 *   - Result-transform pipeline.
 *   - Private API auth via client credentials → bearer token.
 */
import { api } from "./utils/apiClient.ts"
import { createApiModule, deleteApiModule } from "./utils/apiModule.ts"
import {
  createAndPublish,
  deleteAssignment,
  deleteAssignmentsByPathPrefix,
} from "./utils/assignment.ts"
import { deleteAppClientsMatching } from "./utils/client.ts"
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

const MOD = "e2e-gwf-mod-"
const DS = "e2e-gwf-ds-"
const CLI = "e2e-gwf-cli-"
const P = "e2e-gwf-" // path prefix for assignments

let datasourceId: string
let moduleId: string

// Per-test assignment ids to clean up at end.
const createdAssignmentIds: string[] = []

test.beforeAll(async () => {
  await deleteAssignmentsByPathPrefix(P)
  await deleteAppClientsMatching(CLI)
  const listMods = await api.post<{
    data: Array<{ id: string; name: string }>
  }>("/api/v1/modules/list", { page: 1, page_size: 100 })
  await Promise.all(
    listMods.data
      .filter((m) => m.name.startsWith(MOD))
      .map((m) => deleteApiModule(m.id).catch(() => {})),
  )
  await deleteDataSourcesMatching(DS)

  const ds = await createDataSource({ name: `${DS}${Date.now()}` })
  datasourceId = ds.id
  const mod = await createApiModule(`${MOD}${Date.now()}`, "gateway-full")
  moduleId = mod.id
})

test.afterAll(async () => {
  for (const id of createdAssignmentIds) {
    await deleteAssignment(id).catch(() => {})
  }
  await deleteAppClientsMatching(CLI)
  await deleteApiModule(moduleId).catch(() => {})
  await deleteDataSource(datasourceId).catch(() => {})
})

async function publish(
  input: Omit<
    Parameters<typeof createAndPublish>[0],
    "module_id" | "datasource_id"
  >,
) {
  const a = await createAndPublish({
    module_id: moduleId,
    datasource_id: datasourceId,
    ...input,
  })
  createdAssignmentIds.push(a.id)
  return a
}

test("query param flows into SQL via Jinja2", async () => {
  const path = `${P}q-${Date.now()}`
  await publish({
    name: path,
    path,
    content: "SELECT {{ n }}::int AS n, 'ok' AS status",
    params: [{ name: "n", location: "query", data_type: "integer" }],
  })

  const res = await fetch(`${API_BASE}/api/${path}?n=42`)
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: Array<{ n: number }> }
  expect(body.data[0].n).toBe(42)
})

test("POST body param flows into SQL", async () => {
  const path = `${P}body-${Date.now()}`
  await publish({
    name: path,
    path,
    http_method: "POST",
    content: "SELECT {{ greeting | sql_string }} AS msg",
    params: [{ name: "greeting", location: "body", data_type: "string" }],
  })

  const res = await fetch(`${API_BASE}/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ greeting: "xin chao" }),
  })
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: Array<{ msg: string }> }
  expect(body.data[0].msg).toBe("xin chao")
})

test("path param extracted from URL pattern", async () => {
  const prefix = `${P}path-${Date.now()}`
  await publish({
    name: prefix,
    path: `${prefix}/{id}`,
    content: "SELECT {{ id }}::int AS user_id",
    params: [{ name: "id", location: "path", data_type: "integer" }],
  })

  const res = await fetch(`${API_BASE}/api/${prefix}/7`)
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: Array<{ user_id: number }> }
  expect(body.data[0].user_id).toBe(7)
})

test("required param missing returns 400", async () => {
  const path = `${P}req-${Date.now()}`
  await publish({
    name: path,
    path,
    content: "SELECT {{ id }}::int AS id",
    params: [
      {
        name: "id",
        location: "query",
        data_type: "integer",
        is_required: true,
      },
    ],
  })

  const res = await fetch(`${API_BASE}/api/${path}`)
  expect(res.status).toBe(400)
})

test("default value used when param omitted", async () => {
  const path = `${P}def-${Date.now()}`
  await publish({
    name: path,
    path,
    content: "SELECT {{ n }}::int AS n",
    params: [
      {
        name: "n",
        location: "query",
        data_type: "integer",
        default_value: "99",
      },
    ],
  })

  const res = await fetch(`${API_BASE}/api/${path}`)
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: Array<{ n: number }> }
  expect(body.data[0].n).toBe(99)
})

test("unpublished API returns 404", async () => {
  // Create without publishing.
  const path = `${P}unpub-${Date.now()}`
  const a = await api.post<{ id: string }>("/api/v1/api-assignments/create", {
    module_id: moduleId,
    datasource_id: datasourceId,
    name: path,
    path,
    http_method: "GET",
    execute_engine: "SQL",
    access_type: "public",
    content: "SELECT 1",
    params: [],
    param_validates: [],
    group_ids: [],
  })
  createdAssignmentIds.push(a.id)

  const res = await fetch(`${API_BASE}/api/${path}`)
  expect(res.status).toBe(404)
})

test("wrong HTTP method returns 404", async () => {
  const path = `${P}method-${Date.now()}`
  await publish({
    name: path,
    path,
    http_method: "GET",
    content: "SELECT 1",
  })

  const res = await fetch(`${API_BASE}/api/${path}`, { method: "POST" })
  expect(res.status).toBe(404)
})

test("SCRIPT engine returns computed Python result", async () => {
  const path = `${P}script-${Date.now()}`
  await publish({
    name: path,
    path,
    execute_engine: "SCRIPT",
    content:
      'def execute(params):\n    return {"data": [{"msg": "from-python"}]}\n',
  })

  const res = await fetch(`${API_BASE}/api/${path}`)
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: Array<{ msg: string }> }
  expect(body.data[0].msg).toBe("from-python")
})

test("result_transform mutates the response", async () => {
  const path = `${P}xform-${Date.now()}`
  await publish({
    name: path,
    path,
    content: "SELECT 1 AS a, 2 AS b",
    result_transform:
      'def transform(result, params=None):\n    result["transformed"] = True\n    return result\n',
  })

  const res = await fetch(`${API_BASE}/api/${path}`)
  expect(res.status).toBe(200)
  const body = (await res.json()) as Record<string, unknown> & {
    transformed?: boolean
  }
  expect(body.transformed).toBe(true)
})

test("private API: no token → 401; with client-credentials token → 200", async () => {
  const path = `${P}priv-${Date.now()}`
  const a = await publish({
    name: path,
    path,
    access_type: "private",
    content: "SELECT 'secret' AS s",
  })

  // No auth → 401.
  const unauth = await fetch(`${API_BASE}/api/${path}`)
  expect(unauth.status).toBe(401)

  // Create a client and bind it to this assignment.
  const clientName = `${CLI}${Date.now()}`
  const clientSecret = "test-secret-1234"
  const client = await api.post<{
    id: string
    client_id: string
  }>("/api/v1/clients/create", {
    name: clientName,
    client_secret: clientSecret,
    is_active: true,
    group_ids: [],
    api_assignment_ids: [a.id],
  })

  // Exchange credentials for a gateway token.
  const tokRes = await fetch(`${API_BASE}/api/token/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: client.client_id,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  })
  expect(tokRes.status).toBe(200)
  const { access_token } = (await tokRes.json()) as { access_token: string }

  // With token → 200 and payload.
  const authed = await fetch(`${API_BASE}/api/${path}`, {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  expect(authed.status).toBe(200)
  const body = (await authed.json()) as { data: Array<{ s: string }> }
  expect(body.data[0].s).toBe("secret")
})
