/**
 * Gateway advanced features (100% coverage for the feature set):
 *  - Rate limit 429
 *  - Concurrent limit 503 (via pg_sleep + max_concurrent=1)
 *  - Access log recorded in DB
 *  - Custom param-validate Python script returns false → 400
 *  - Group-based access for private APIs
 *  - Version switching (publish v1 then v2)
 */
import { api } from "./utils/apiClient.ts"
import { createApiModule, deleteApiModule } from "./utils/apiModule.ts"
import {
  createAndPublish,
  createAssignment,
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

const MOD = "e2e-gwa-mod-"
const DS = "e2e-gwa-ds-"
const CLI = "e2e-gwa-cli-"
const GRP = "e2e-gwa-grp-"
const P = "e2e-gwa-"

let datasourceId: string
let moduleId: string
const createdAssignmentIds: string[] = []
const createdGroupIds: string[] = []

async function deleteGroupsMatching(prefix: string) {
  const res = await api.post<{ data: Array<{ id: string; name: string }> }>(
    "/api/v1/groups/list",
    { page: 1, page_size: 100 },
  )
  await Promise.all(
    res.data
      .filter((g) => g.name.startsWith(prefix))
      .map((g) => api.delete(`/api/v1/groups/delete/${g.id}`).catch(() => {})),
  )
}

test.beforeAll(async () => {
  await deleteAssignmentsByPathPrefix(P)
  await deleteAppClientsMatching(CLI)
  await deleteGroupsMatching(GRP)
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
  const mod = await createApiModule(`${MOD}${Date.now()}`, "gateway-adv")
  moduleId = mod.id
})

test.afterAll(async () => {
  for (const id of createdAssignmentIds) {
    await deleteAssignment(id).catch(() => {})
  }
  for (const id of createdGroupIds) {
    await api.delete(`/api/v1/groups/delete/${id}`).catch(() => {})
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

// ---------------------------------------------------------------------------
// 1. Rate limit 429
// ---------------------------------------------------------------------------
test("rate_limit_per_minute: 3rd request within window returns 429", async () => {
  const path = `${P}rl-${Date.now()}`
  await publish({
    name: path,
    path,
    content: "SELECT 1 AS x",
    rate_limit_per_minute: 2,
  })

  // Serialize to avoid racing the limiter.
  const r1 = await fetch(`${API_BASE}/api/${path}`)
  const r2 = await fetch(`${API_BASE}/api/${path}`)
  const r3 = await fetch(`${API_BASE}/api/${path}`)
  expect(r1.status).toBe(200)
  expect(r2.status).toBe(200)
  expect(r3.status).toBe(429)
})

// ---------------------------------------------------------------------------
// 2. Concurrent limit 503 (private API + client with max_concurrent=1)
// ---------------------------------------------------------------------------
test("client max_concurrent=1: parallel request returns 503", async () => {
  const path = `${P}cc-${Date.now()}`
  // pg_sleep(0.8) makes each call hold a slot long enough to race.
  const a = await publish({
    name: path,
    path,
    access_type: "private",
    content: "SELECT pg_sleep(0.8), 1 AS x",
  })

  const clientName = `${CLI}cc-${Date.now()}`
  const clientSecret = "cc-secret-1234"
  const client = await api.post<{ id: string; client_id: string }>(
    "/api/v1/clients/create",
    {
      name: clientName,
      client_secret: clientSecret,
      is_active: true,
      max_concurrent: 1,
      group_ids: [],
      api_assignment_ids: [a.id],
    },
  )

  const tok = await fetch(`${API_BASE}/api/token/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: client.client_id,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  }).then((r) => r.json() as Promise<{ access_token: string }>)
  const headers = { Authorization: `Bearer ${tok.access_token}` }

  const [first, second] = await Promise.all([
    fetch(`${API_BASE}/api/${path}`, { headers }),
    fetch(`${API_BASE}/api/${path}`, { headers }),
  ])
  const statuses = [first.status, second.status].sort()
  // One slot holder returns 200, the second racer gets 503.
  expect(statuses).toEqual([200, 503])
})

// ---------------------------------------------------------------------------
// 3. Access log recorded in DB
// ---------------------------------------------------------------------------
test("gateway call is persisted in /api/v1/access-logs", async () => {
  const path = `${P}log-${Date.now()}`
  await publish({ name: path, path, content: "SELECT 1 AS x" })

  const before = Date.now()
  const res = await fetch(`${API_BASE}/api/${path}`)
  expect(res.status).toBe(200)

  // Access log write is backgrounded; poll briefly.
  let found = false
  for (let i = 0; i < 10 && !found; i++) {
    await new Promise((r) => setTimeout(r, 300))
    const logs = await api.get<{
      data: Array<{ path: string; status_code: number; http_method: string }>
    }>(`/api/v1/access-logs?path__ilike=${path}&page_size=5`)
    found = logs.data.some(
      (l) =>
        l.path === path && l.http_method === "GET" && l.status_code === 200,
    )
  }
  expect(found, `access log for ${path} not found`).toBe(true)
  expect(Date.now() - before).toBeLessThan(10_000)
})

// ---------------------------------------------------------------------------
// 4. Custom param_validate returns 400
// ---------------------------------------------------------------------------
test("param_validates script returns false → 400", async () => {
  const path = `${P}pv-${Date.now()}`
  await publish({
    name: path,
    path,
    content: "SELECT {{ n }}::int AS n",
    params: [{ name: "n", location: "query", data_type: "integer" }],
    // Note: param_validates is a separate list on ApiAssignmentCreate;
    // we need to extend the helper payload.
    param_validates: [
      {
        name: "n",
        validation_script:
          "def validate(value, params=None):\n    return int(value) > 10\n",
        message_when_fail: "n must be > 10",
      },
    ],
  })

  const bad = await fetch(`${API_BASE}/api/${path}?n=5`)
  expect(bad.status).toBe(400)
  const good = await fetch(`${API_BASE}/api/${path}?n=15`)
  expect(good.status).toBe(200)
})

// ---------------------------------------------------------------------------
// 5. Group-based access (private API via group membership)
// ---------------------------------------------------------------------------
test("client in group can call API; client outside gets 403", async () => {
  // Create a group; create an API assigned ONLY to that group.
  const group = await api.post<{ id: string }>("/api/v1/groups/create", {
    name: `${GRP}${Date.now()}`,
    is_active: true,
  })
  createdGroupIds.push(group.id)

  const path = `${P}grp-${Date.now()}`
  const a = await publish({
    name: path,
    path,
    access_type: "private",
    content: "SELECT 'group-ok' AS s",
    // group_ids attaches the API to the group via ApiAssignmentGroupLink.
    group_ids: [group.id],
  })

  // Client A is in the group (effective access via group link).
  const inName = `${CLI}in-${Date.now()}`
  const inSecret = "in-secret-1234"
  const inClient = await api.post<{ id: string; client_id: string }>(
    "/api/v1/clients/create",
    {
      name: inName,
      client_secret: inSecret,
      is_active: true,
      group_ids: [group.id],
      api_assignment_ids: [],
    },
  )

  // Client B has no groups and no direct assignment.
  const outName = `${CLI}out-${Date.now()}`
  const outSecret = "out-secret-1234"
  const outClient = await api.post<{ id: string; client_id: string }>(
    "/api/v1/clients/create",
    {
      name: outName,
      client_secret: outSecret,
      is_active: true,
      group_ids: [],
      api_assignment_ids: [],
    },
  )

  const tokenFor = async (clientId: string, secret: string) => {
    const r = await fetch(`${API_BASE}/api/token/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: secret,
        grant_type: "client_credentials",
      }),
    })
    return (await r.json()) as { access_token: string }
  }
  const inTok = await tokenFor(inClient.client_id, inSecret)
  const outTok = await tokenFor(outClient.client_id, outSecret)

  const inRes = await fetch(`${API_BASE}/api/${path}`, {
    headers: { Authorization: `Bearer ${inTok.access_token}` },
  })
  expect(inRes.status).toBe(200)

  const outRes = await fetch(`${API_BASE}/api/${path}`, {
    headers: { Authorization: `Bearer ${outTok.access_token}` },
  })
  expect(outRes.status).toBe(403)
  // Silence unused-var from assignment helper result.
  expect(a.id).toBeTruthy()
})

// ---------------------------------------------------------------------------
// 6. Version switching
// ---------------------------------------------------------------------------
test("publish v2 replaces v1 at the gateway", async () => {
  const path = `${P}ver-${Date.now()}`
  // Create + publish v1.
  const a = await createAssignment({
    module_id: moduleId,
    datasource_id: datasourceId,
    name: path,
    path,
    access_type: "public",
    content: "SELECT 'v1' AS v",
  })
  createdAssignmentIds.push(a.id)

  const v1 = await api.post<{ id: string }>(
    `/api/v1/api-assignments/${a.id}/versions/create`,
    { commit_message: "v1" },
  )
  await api.post("/api/v1/api-assignments/publish", {
    id: a.id,
    version_id: v1.id,
  })

  let r = await fetch(`${API_BASE}/api/${path}`)
  let body = (await r.json()) as { data: Array<{ v: string }> }
  expect(body.data[0].v).toBe("v1")

  // Update content, snapshot v2, publish v2.
  await api.post("/api/v1/api-assignments/update", {
    id: a.id,
    content: "SELECT 'v2' AS v",
  })
  const v2 = await api.post<{ id: string }>(
    `/api/v1/api-assignments/${a.id}/versions/create`,
    { commit_message: "v2" },
  )
  await api.post("/api/v1/api-assignments/publish", {
    id: a.id,
    version_id: v2.id,
  })

  r = await fetch(`${API_BASE}/api/${path}`)
  body = (await r.json()) as { data: Array<{ v: string }> }
  expect(body.data[0].v).toBe("v2")
})
