/**
 * Shared API request utility for all service files.
 *
 * Handles: auth token injection, Content-Type header, error parsing,
 * and request cancellation via AbortSignal.
 *
 * Endpoint should be the full path including prefix, e.g. "/api/v1/datasources/list".
 */

import { OpenAPI } from "@/client"

export const API_BASE =
  OpenAPI.BASE || import.meta.env.VITE_API_URL || "http://localhost:8000"

async function getAuthToken(): Promise<string | null> {
  if (!OpenAPI.TOKEN) return null
  if (typeof OpenAPI.TOKEN === "function") {
    return OpenAPI.TOKEN({} as { url: string })
  }
  return OpenAPI.TOKEN
}

function parseErrorDetail(error: unknown): string {
  if (error && typeof error === "object" && "detail" in error) {
    const detail = (error as { detail?: unknown }).detail
    if (typeof detail === "string") return detail
    if (detail != null) return JSON.stringify(detail)
  }
  return ""
}

export type RequestOptions = RequestInit & {
  /** AbortSignal for request cancellation (e.g. from React Query) */
  signal?: AbortSignal
}

/**
 * Authenticated JSON request. Returns parsed JSON body.
 *
 * @param endpoint Full API path, e.g. "/api/v1/datasources/list"
 * @param options  Standard RequestInit overrides (supports signal for cancellation)
 */
export async function request<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { signal, ...rest } = options
  const token = await getAuthToken()
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...rest,
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers as Record<string, string>),
    },
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: response.statusText }))
    throw new Error(
      parseErrorDetail(error) || `HTTP error! status: ${response.status}`,
    )
  }

  return response.json()
}

/**
 * Authenticated request that expects no JSON body (e.g. 204 No Content).
 */
export async function requestNoContent(
  endpoint: string,
  options: RequestOptions = {},
): Promise<void> {
  const { signal, ...rest } = options
  const token = await getAuthToken()
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...rest,
    signal,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers as Record<string, string>),
    },
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: response.statusText }))
    throw new Error(
      parseErrorDetail(error) || `HTTP error! status: ${response.status}`,
    )
  }
}
