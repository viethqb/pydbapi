/**
 * Client access control for ReportModule:
 *  - Setting `client_ids` on a module links AppClients via
 *    ReportModuleClientLink (verify via detail endpoint).
 *  - A client linked to the module can mint a gateway token and call
 *    `/report-modules/{id}/templates/{tid}/generate`.
 *  - A client NOT linked is rejected with 403.
 */
import { api } from "./utils/apiClient.ts"
import { deleteAppClientsMatching } from "./utils/client.ts"
import {
  createDataSource,
  deleteDataSource,
  deleteDataSourcesMatching,
} from "./utils/datasource.ts"
import { expect, test } from "./utils/fixtures.ts"
import {
  createReportModule,
  createReportTemplate,
  deleteReportModule,
  deleteReportModulesMatching,
  deleteReportTemplate,
} from "./utils/reportModule.ts"

test.describe.configure({ mode: "serial" })

const API_BASE =
  process.env.PLAYWRIGHT_API_URL ||
  process.env.VITE_API_URL ||
  "http://localhost:8000"
const NAME_BASE = "e2e-rclient-"
const CLI = `${NAME_BASE}cli-`

let minioDsId: string
let sqlDsId: string
let moduleId: string
let templateId: string
let allowedClientId: string
let allowedClientSecret: string
let deniedClientId: string
let deniedClientSecret: string

test.beforeAll(async () => {
  await deleteReportModulesMatching(NAME_BASE)
  await deleteAppClientsMatching(CLI)
  await deleteDataSourcesMatching(`${NAME_BASE}minio-`)
  await deleteDataSourcesMatching(`${NAME_BASE}pg-`)

  const minio = await createDataSource({
    name: `${NAME_BASE}minio-${Date.now()}`,
    product_type: "minio",
    host: "localhost",
    port: 9000,
    database: "default",
    username: "minioadmin",
    password: "minioadmin",
  })
  const sql = await createDataSource({ name: `${NAME_BASE}pg-${Date.now()}` })
  minioDsId = minio.id
  sqlDsId = sql.id

  const mod = await createReportModule({
    name: `${NAME_BASE}${Date.now()}`,
    minio_datasource_id: minio.id,
    sql_datasource_id: sql.id,
    default_template_bucket: "templates",
    default_output_bucket: "output",
  })
  moduleId = mod.id

  const tpl = await createReportTemplate(
    moduleId,
    `${NAME_BASE}tpl-${Date.now()}`,
  )
  templateId = tpl.id
  await api.post(
    `/api/v1/report-modules/${moduleId}/templates/${templateId}/mappings/create`,
    {
      sort_order: 0,
      sheet_name: "Data",
      start_cell: "A1",
      write_mode: "rows",
      write_headers: true,
      sql_content: "SELECT 1 AS ok",
    },
  )

  // Two AppClients; bind one to the module.
  allowedClientSecret = "allowed-secret-1234"
  const allowed = await api.post<{ id: string; client_id: string }>(
    "/api/v1/clients/create",
    {
      name: `${CLI}allowed-${Date.now()}`,
      client_secret: allowedClientSecret,
      is_active: true,
      group_ids: [],
      api_assignment_ids: [],
    },
  )
  allowedClientId = allowed.client_id

  deniedClientSecret = "denied-secret-1234"
  const denied = await api.post<{ id: string; client_id: string }>(
    "/api/v1/clients/create",
    {
      name: `${CLI}denied-${Date.now()}`,
      client_secret: deniedClientSecret,
      is_active: true,
      group_ids: [],
      api_assignment_ids: [],
    },
  )
  deniedClientId = denied.client_id

  // Link only the allowed client to the module.
  await api.post(`/api/v1/report-modules/${moduleId}/clients`, {
    client_ids: [allowed.id],
  })
})

test.afterAll(async () => {
  await deleteAppClientsMatching(CLI)
  await deleteReportTemplate(moduleId, templateId).catch(() => {})
  await deleteReportModule(moduleId).catch(() => {})
  await deleteDataSource(sqlDsId).catch(() => {})
  await deleteDataSource(minioDsId).catch(() => {})
})

async function mintGatewayToken(
  clientId: string,
  secret: string,
): Promise<string> {
  const r = await fetch(`${API_BASE}/api/token/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: secret,
      grant_type: "client_credentials",
    }),
  })
  expect(r.status).toBe(200)
  const body = (await r.json()) as { access_token: string }
  return body.access_token
}

test("module/clients endpoint persists client_ids", async () => {
  const detail = await api.get<{ client_ids: string[] }>(
    `/api/v1/report-modules/${moduleId}`,
  )
  expect(detail.client_ids).toHaveLength(1)
})

test("linked client can generate a report via gateway token", async () => {
  const token = await mintGatewayToken(allowedClientId, allowedClientSecret)
  const res = await fetch(
    `${API_BASE}/api/v1/report-modules/${moduleId}/templates/${templateId}/generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ parameters: {} }),
    },
  )
  expect(res.status).toBe(200)
  const body = (await res.json()) as { status: string; execution_id: string }
  expect(body.status).toBe("success")
  expect(body.execution_id).toBeTruthy()
})

test("unlinked client is rejected with 403", async () => {
  const token = await mintGatewayToken(deniedClientId, deniedClientSecret)
  const res = await fetch(
    `${API_BASE}/api/v1/report-modules/${moduleId}/templates/${templateId}/generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ parameters: {} }),
    },
  )
  expect(res.status).toBe(403)
})

test("missing Authorization returns 401", async () => {
  const res = await fetch(
    `${API_BASE}/api/v1/report-modules/${moduleId}/templates/${templateId}/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parameters: {} }),
    },
  )
  expect(res.status).toBe(401)
})
