/**
 * Gateway API Key (JWT) for calling private APIs.
 * Obtained from POST /api/token/generate with client_id and client_secret.
 * Stored in localStorage; used when testing private APIs in API Repository and API Dev.
 */

const STORAGE_KEY = "gateway_api_key"

export function getGatewayApiKey(): string | null {
  if (typeof window === "undefined") return null
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v?.trim() ? v.trim() : null
  } catch {
    return null
  }
}

export function setGatewayApiKey(value: string | null): void {
  if (typeof window === "undefined") return
  try {
    if (value == null || !value.trim()) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, value.trim())
    }
  } catch {
    // ignore
  }
}
