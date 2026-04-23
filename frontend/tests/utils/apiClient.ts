/**
 * Lightweight authenticated API client for E2E test data setup.
 *
 * Used by fixture helpers to create/delete backend resources via REST,
 * bypassing the UI. Reads the superuser token written by global-setup.ts
 * so workers share one login and avoid the login-rate-limit.
 */
import { readFileSync } from "node:fs"
import { firstSuperuser, firstSuperuserPassword } from "../config.ts"

const API_BASE =
  process.env.PLAYWRIGHT_API_URL ||
  process.env.VITE_API_URL ||
  "http://localhost:8000"

const TOKEN_FILE = "playwright/.auth/api-token.json"

let cachedToken: string | null = null

async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken

  try {
    const raw = readFileSync(TOKEN_FILE, "utf8")
    const { token } = JSON.parse(raw) as { token: string }
    if (token) {
      cachedToken = token
      return token
    }
  } catch {
    // Token file missing — fall through to direct login (useful when a single
    // spec is run without globalSetup).
  }

  const body = new URLSearchParams({
    username: firstSuperuser,
    password: firstSuperuserPassword,
  })
  const res = await fetch(`${API_BASE}/api/v1/login/access-token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`)
  }
  const data = (await res.json()) as { access_token: string }
  cachedToken = data.access_token
  return cachedToken
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string>),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${init.method || "GET"} ${path} → ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
}
