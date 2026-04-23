/**
 * Permission-guarded routes redirect when the user lacks required perms.
 * A fresh user has no roles assigned, so `/admin`, `/connection`, `/api-dev`,
 * and `/system` should all redirect to `/`. `/settings` stays accessible.
 */
import { expect, test } from "@playwright/test"
import { createUser, deleteUsersMatching } from "./utils/privateApi.ts"
import { randomEmail, randomPassword } from "./utils/random.ts"
import { logInUser } from "./utils/user.ts"

test.use({ storageState: { cookies: [], origins: [] } })
test.describe.configure({ mode: "serial" })

const PREFIX = "e2eperm"

let username: string
let password: string

test.beforeAll(async () => {
  await deleteUsersMatching(PREFIX)
  username = `${PREFIX}${Date.now().toString().slice(-8)}`
  password = `Aa1${randomPassword()}!`
  await createUser({
    username,
    email: randomEmail(),
    password,
    fullName: "Perm Test",
  })
})

test.afterAll(async () => {
  await deleteUsersMatching(PREFIX)
})

/**
 * With RoutePermissionGuard wired into /_layout, a user without perms for a
 * given path prefix is redirected (replace) to "/" and the page heading for
 * the guarded route never appears.
 */
async function assertRedirectedAwayFrom(
  page: import("@playwright/test").Page,
  target: string,
  protectedHeading: string | RegExp,
) {
  await page.goto(target)
  // Guard's useEffect fires after user + permissions load.
  await page.waitForURL(
    (url) => !url.pathname.startsWith(target.split("?")[0]),
    { timeout: 5_000 },
  )
  await expect(
    page.getByRole("heading", { name: protectedHeading }),
  ).toHaveCount(0)
}

test.describe("Permission guard", () => {
  test("user without roles is redirected away from /admin/users", async ({
    page,
  }) => {
    await logInUser(page, username, password)
    await assertRedirectedAwayFrom(page, "/admin/users", "Users")
  })

  test("user without roles is redirected away from /connection", async ({
    page,
  }) => {
    await logInUser(page, username, password)
    await assertRedirectedAwayFrom(page, "/connection", "Data Sources")
  })

  test("user without roles is redirected away from /system/clients", async ({
    page,
  }) => {
    await logInUser(page, username, password)
    await assertRedirectedAwayFrom(page, "/system/clients", "Clients")
  })

  test("user without roles is redirected away from /api-dev", async ({
    page,
  }) => {
    await logInUser(page, username, password)
    await assertRedirectedAwayFrom(page, "/api-dev", "API Development")
  })

  test("/settings stays accessible without any roles", async ({ page }) => {
    await logInUser(page, username, password)
    await page.goto("/settings")
    await expect(
      page.getByRole("heading", { name: "User Settings" }),
    ).toBeVisible()
  })

  test("/ dashboard stays accessible without any roles", async ({ page }) => {
    await logInUser(page, username, password)
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
  })
})
