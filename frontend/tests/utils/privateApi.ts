/**
 * Test-only user factory, implemented against the authenticated superuser
 * API (bypasses the `PrivateService` that the OpenAPI client exposes, which
 * currently has a stale signature).
 */
import { api } from "./apiClient.ts"

export type CreatedUser = {
  id: string
  username: string
  email: string
  full_name: string | null
}

/**
 * Creates a non-superuser via POST /users/.
 * Username defaults to the email local-part so login-by-username works.
 */
export async function createUser({
  email,
  password,
  username,
  fullName = "Test User",
}: {
  email: string
  password: string
  username?: string
  fullName?: string
}): Promise<CreatedUser> {
  const uname = username ?? email.split("@")[0].replace(/[^a-z0-9]/gi, "")
  return api.post<CreatedUser>("/api/v1/users/", {
    username: uname,
    email,
    password,
    full_name: fullName,
    is_active: true,
    is_superuser: false,
  })
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/api/v1/users/${id}`)
}

export async function deleteUsersMatching(prefix: string): Promise<void> {
  const res = await api.get<{
    data: Array<{ id: string; username: string }>
  }>("/api/v1/users/?skip=0&limit=200")
  await Promise.all(
    res.data
      .filter((u) => u.username.startsWith(prefix))
      .map((u) => deleteUser(u.id).catch(() => {})),
  )
}
