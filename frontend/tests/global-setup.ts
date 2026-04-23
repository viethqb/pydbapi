/**
 * Playwright global setup: acquire one API token for the superuser and
 * write it to disk so test workers can reuse it without hitting the login
 * rate limit. Reads .env via Playwright's dotenv integration.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { firstSuperuser, firstSuperuserPassword } from "./config.ts"

const API_BASE =
  process.env.PLAYWRIGHT_API_URL ||
  process.env.VITE_API_URL ||
  "http://localhost:8000"

export const TOKEN_FILE = "playwright/.auth/api-token.json"

export default async function globalSetup() {
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
    throw new Error(
      `globalSetup login failed: ${res.status} ${await res.text()}`,
    )
  }
  const data = (await res.json()) as { access_token: string }
  mkdirSync(dirname(TOKEN_FILE), { recursive: true })
  writeFileSync(TOKEN_FILE, JSON.stringify({ token: data.access_token }))
}
