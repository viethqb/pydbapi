import { api } from "./apiClient.ts"

export type AssignmentCreateInput = {
  module_id: string
  datasource_id: string
  name: string
  path: string
  http_method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  execute_engine?: "SQL" | "SCRIPT"
  access_type?: "public" | "private"
  content: string
  params?: Array<{
    name: string
    location: "query" | "header" | "body" | "path"
    data_type?: string | null
    is_required?: boolean
    default_value?: string | null
  }>
  param_validates?: Array<{
    name: string
    validation_script?: string | null
    message_when_fail?: string | null
  }>
  group_ids?: string[]
  result_transform?: string | null
  rate_limit_per_minute?: number | null
}

export type AssignmentRecord = { id: string; path: string }

export async function createAssignment(
  input: AssignmentCreateInput,
): Promise<AssignmentRecord> {
  return api.post<AssignmentRecord>("/api/v1/api-assignments/create", {
    http_method: "GET",
    execute_engine: "SQL",
    access_type: "public",
    params: [],
    param_validates: [],
    group_ids: [],
    ...input,
  })
}

/** Create, snapshot v1, and publish in one go. Returns assignment id. */
export async function createAndPublish(
  input: AssignmentCreateInput,
): Promise<AssignmentRecord> {
  const assignment = await createAssignment(input)
  const version = await api.post<{ id: string }>(
    `/api/v1/api-assignments/${assignment.id}/versions/create`,
    { commit_message: "initial" },
  )
  await api.post("/api/v1/api-assignments/publish", {
    id: assignment.id,
    version_id: version.id,
  })
  return assignment
}

export async function deleteAssignment(id: string): Promise<void> {
  await api.delete(`/api/v1/api-assignments/delete/${id}`)
}

export async function deleteAssignmentsByPathPrefix(
  prefix: string,
): Promise<void> {
  const res = await api.post<{ data: Array<{ id: string; path: string }> }>(
    "/api/v1/api-assignments/list",
    { page: 1, page_size: 200 },
  )
  await Promise.all(
    res.data
      .filter((a) => a.path.startsWith(prefix))
      .map((a) => deleteAssignment(a.id).catch(() => {})),
  )
}
