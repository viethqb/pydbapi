import { OpenAPI } from "@/client"

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

const API_BASE =
  OpenAPI.BASE || import.meta.env.VITE_API_URL || "http://localhost:8000"

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  let token: string | null = null
  if (OpenAPI.TOKEN) {
    if (typeof OpenAPI.TOKEN === "function") {
      token = await OpenAPI.TOKEN({ url: endpoint } as { url: string })
    } else {
      token = OpenAPI.TOKEN
    }
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || `HTTP error! status: ${response.status}`)
  }

  return response.json()
}

export const OverviewService = {
  getStats: async (): Promise<OverviewStats> => {
    return request<OverviewStats>("/api/v1/overview/stats", { method: "GET" })
  },

  getRecentAccess: async (limit = 20): Promise<RecentAccessOut> => {
    const params = new URLSearchParams({ limit: String(limit) })
    return request<RecentAccessOut>(
      `/api/v1/overview/recent-access?${params}`,
      {
        method: "GET",
      },
    )
  },

  getRecentCommits: async (limit = 20): Promise<RecentCommitsOut> => {
    const params = new URLSearchParams({ limit: String(limit) })
    return request<RecentCommitsOut>(
      `/api/v1/overview/recent-commits?${params}`,
      {
        method: "GET",
      },
    )
  },

  getRequestsByDay: async (days = 14): Promise<RequestsByDayOut> => {
    const params = new URLSearchParams({ days: String(days) })
    return request<RequestsByDayOut>(
      `/api/v1/overview/requests-by-day?${params}`,
      {
        method: "GET",
      },
    )
  },

  getTopPaths: async (days = 7, limit = 10): Promise<TopPathsOut> => {
    const params = new URLSearchParams({
      days: String(days),
      limit: String(limit),
    })
    return request<TopPathsOut>(`/api/v1/overview/top-paths?${params}`, {
      method: "GET",
    })
  },
}
