import { request, type RequestOptions } from "@/lib/api-request"

export type OverviewStats = {
  datasources: number
  modules: number
  groups: number
  apis_total: number
  apis_published: number
  clients: number
}

export type AccessRecordPublic = {
  id: string
  api_assignment_id: string | null
  app_client_id: string | null
  ip_address: string
  http_method: string
  path: string
  status_code: number
  created_at: string
}

export type RecentAccessOut = {
  data: AccessRecordPublic[]
}

export type VersionCommitPublic = {
  id: string
  api_assignment_id: string
  version: number
  commit_message: string | null
  committed_by_id: string | null
  committed_by_email: string | null
  http_method: string | null
  full_path: string | null
  committed_at: string
}

export type RecentCommitsOut = {
  data: VersionCommitPublic[]
}

export type RequestsByDayPoint = {
  day: string // YYYY-MM-DD
  count: number
}

export type RequestsByDayOut = {
  data: RequestsByDayPoint[]
}

export type TopPathPoint = {
  path: string
  count: number
}

export type TopPathsOut = {
  data: TopPathPoint[]
}

type Opts = Pick<RequestOptions, "signal">

export const OverviewService = {
  getStats: async (opts?: Opts): Promise<OverviewStats> => {
    return request<OverviewStats>("/api/v1/overview/stats", {
      method: "GET",
      signal: opts?.signal,
    })
  },

  getRecentAccess: async (limit = 20, opts?: Opts): Promise<RecentAccessOut> => {
    const params = new URLSearchParams({ limit: String(limit) })
    return request<RecentAccessOut>(
      `/api/v1/overview/recent-access?${params}`,
      { method: "GET", signal: opts?.signal },
    )
  },

  getRecentCommits: async (limit = 20, opts?: Opts): Promise<RecentCommitsOut> => {
    const params = new URLSearchParams({ limit: String(limit) })
    return request<RecentCommitsOut>(
      `/api/v1/overview/recent-commits?${params}`,
      { method: "GET", signal: opts?.signal },
    )
  },

  getRequestsByDay: async (days = 14, opts?: Opts): Promise<RequestsByDayOut> => {
    const params = new URLSearchParams({ days: String(days) })
    return request<RequestsByDayOut>(
      `/api/v1/overview/requests-by-day?${params}`,
      { method: "GET", signal: opts?.signal },
    )
  },

  getTopPaths: async (days = 7, limit = 10, opts?: Opts): Promise<TopPathsOut> => {
    const params = new URLSearchParams({
      days: String(days),
      limit: String(limit),
    })
    return request<TopPathsOut>(`/api/v1/overview/top-paths?${params}`, {
      method: "GET",
      signal: opts?.signal,
    })
  },
}
