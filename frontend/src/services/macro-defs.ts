import { OpenAPI } from "@/client"

export type MacroTypeEnum = "JINJA" | "PYTHON"

export type ApiMacroDefPublic = {
  id: string
  module_id: string | null
  name: string
  macro_type: MacroTypeEnum
  content: string
  description: string | null
  sort_order: number
  is_published: boolean
  published_version_id: string | null
  created_at: string
  updated_at: string
}

export type ApiMacroDefDetail = ApiMacroDefPublic & {
  used_by_apis_count: number
}

export type MacroDefVersionCommitPublic = {
  id: string
  api_macro_def_id: string
  version: number
  commit_message: string | null
  committed_by_id: string | null
  committed_by_email: string | null
  committed_at: string
}

export type MacroDefVersionCommitDetail = MacroDefVersionCommitPublic & {
  content_snapshot: string
}

export type MacroDefVersionCommitCreate = {
  commit_message?: string | null
}

export type MacroDefVersionCommitListOut = {
  data: MacroDefVersionCommitPublic[]
}

export type ApiMacroDefPublishIn = {
  id: string
  version_id?: string | null
}

export type ApiMacroDefListIn = {
  page?: number
  page_size?: number
  module_id?: string | null
  macro_type?: MacroTypeEnum | null
  name__ilike?: string | null
}

export type ApiMacroDefListOut = {
  data: ApiMacroDefPublic[]
  total: number
}

export type ApiMacroDefCreate = {
  module_id?: string | null
  name: string
  macro_type: MacroTypeEnum
  content: string
  description?: string | null
  sort_order?: number
}

export type ApiMacroDefUpdate = {
  id: string
  module_id?: string | null
  name?: string | null
  macro_type?: MacroTypeEnum | null
  content?: string | null
  description?: string | null
  sort_order?: number | null
}

const API_BASE = OpenAPI.BASE || import.meta.env.VITE_API_URL || "http://localhost:8000"

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  let token: string | null = null
  if (OpenAPI.TOKEN) {
    if (typeof OpenAPI.TOKEN === "function") {
      token = await OpenAPI.TOKEN({} as { url: string })
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
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(
      typeof error.detail === "string" ? error.detail : JSON.stringify(error.detail),
    )
  }

  return response.json()
}

export const MacroDefsService = {
  list: async (body: ApiMacroDefListIn): Promise<ApiMacroDefListOut> => {
    return request<ApiMacroDefListOut>("/api/v1/macro-defs/list", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  listSimple: async (moduleId?: string | null): Promise<ApiMacroDefPublic[]> => {
    const params = moduleId ? `?module_id=${moduleId}` : ""
    return request<ApiMacroDefPublic[]>(`/api/v1/macro-defs${params}`, {
      method: "GET",
    })
  },

  create: async (body: ApiMacroDefCreate): Promise<ApiMacroDefPublic> => {
    return request<ApiMacroDefPublic>("/api/v1/macro-defs/create", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  update: async (body: ApiMacroDefUpdate): Promise<ApiMacroDefPublic> => {
    return request<ApiMacroDefPublic>("/api/v1/macro-defs/update", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  delete: async (id: string): Promise<{ message: string }> => {
    return request<{ message: string }>(`/api/v1/macro-defs/delete/${id}`, {
      method: "DELETE",
    })
  },

  get: async (id: string): Promise<ApiMacroDefDetail> => {
    return request<ApiMacroDefDetail>(`/api/v1/macro-defs/${id}`, {
      method: "GET",
    })
  },

  publish: async (body: ApiMacroDefPublishIn): Promise<ApiMacroDefPublic> => {
    return request<ApiMacroDefPublic>("/api/v1/macro-defs/publish", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  unpublish: async (body: { id: string }): Promise<ApiMacroDefPublic> => {
    return request<ApiMacroDefPublic>("/api/v1/macro-defs/unpublish", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  createVersion: async (
    id: string,
    body: MacroDefVersionCommitCreate,
  ): Promise<MacroDefVersionCommitDetail> => {
    return request<MacroDefVersionCommitDetail>(`/api/v1/macro-defs/${id}/versions/create`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  },

  listVersions: async (id: string): Promise<MacroDefVersionCommitListOut> => {
    return request<MacroDefVersionCommitListOut>(`/api/v1/macro-defs/${id}/versions`, {
      method: "GET",
    })
  },

  getVersion: async (versionId: string): Promise<MacroDefVersionCommitDetail> => {
    return request<MacroDefVersionCommitDetail>(`/api/v1/macro-defs/versions/${versionId}`, {
      method: "GET",
    })
  },

  restoreVersion: async (
    id: string,
    versionId: string,
  ): Promise<ApiMacroDefPublic> => {
    return request<ApiMacroDefPublic>(`/api/v1/macro-defs/${id}/versions/${versionId}/restore`, {
      method: "POST",
    })
  },

  deleteVersion: async (versionId: string): Promise<{ message: string }> => {
    return request<{ message: string }>(`/api/v1/macro-defs/versions/${versionId}`, {
      method: "DELETE",
    })
  },

  revertVersionToDraft: async (versionId: string): Promise<{ message: string }> => {
    return request<{ message: string }>(
      `/api/v1/macro-defs/versions/${versionId}/revert-to-draft`,
      { method: "POST" }
    )
  },
}
