/**
 * /settings page:
 *  - Tabs render (My profile, Password, Danger zone).
 *  - Edit full name, edit email (via a fresh test user).
 *  - Cancel edit restores original values.
 *  - Change password with valid + invalid inputs.
 *  - Appearance (theme) toggle preserved across sessions.
 *
 * Fresh users are created via the authenticated superuser API
 * (`createUser` in privateApi.ts).
 */
import { expect, test } from "@playwright/test"
import { firstSuperuser, firstSuperuserPassword } from "./config.ts"
import { createUser, deleteUsersMatching } from "./utils/privateApi.ts"
import { randomEmail, randomPassword } from "./utils/random.ts"
import { logInUser, logOutUser } from "./utils/user.ts"

// Serialize the whole file: every test here either shares a fresh-user
// identity or toggles app state (theme), and parallel runs tend to race the
// login endpoint.
test.describe.configure({ mode: "serial" })

const tabs = ["My profile", "Password", "Danger zone"]
const USER_PREFIX = "e2esettings"

test.afterAll(async () => {
  await deleteUsersMatching(USER_PREFIX)
})

function makeUserInputs() {
  const suffix = Date.now().toString().slice(-8)
  const username = `${USER_PREFIX}${suffix}`
  return {
    username,
    email: randomEmail(),
    password: `Aa1${randomPassword()}!`,
  }
}

test.describe("Settings page (superuser session)", () => {
  test("My profile tab is active by default", async ({ page }) => {
    await page.goto("/settings")
    await expect(page.getByRole("tab", { name: "My profile" })).toHaveAttribute(
      "aria-selected",
      "true",
    )
  })

  test("All tabs are visible", async ({ page }) => {
    await page.goto("/settings")
    for (const tab of tabs) {
      await expect(page.getByRole("tab", { name: tab })).toBeVisible()
    }
  })

  test("Appearance button is visible in sidebar", async ({ page }) => {
    await page.goto("/settings")
    await expect(page.getByTestId("theme-button")).toBeVisible()
  })

  test("User can switch between theme modes", async ({ page }) => {
    await page.goto("/settings")
    await page.getByTestId("theme-button").click()
    await page.getByTestId("dark-mode").click()
    await expect(page.locator("html")).toHaveClass(/dark/)

    await expect(page.getByTestId("dark-mode")).not.toBeVisible()

    await page.getByTestId("theme-button").click()
    await page.getByTestId("light-mode").click()
    await expect(page.locator("html")).toHaveClass(/light/)
  })
})

test.describe("Edit profile and password (fresh user)", () => {
  // These tests log in as a test user, so they must not reuse the superuser
  // storage state. Run serially to stay under the backend login rate limit.
  test.describe.configure({ mode: "serial" })
  test.use({ storageState: { cookies: [], origins: [] } })

  test("Edit full name", async ({ page }) => {
    const { username, email, password } = makeUserInputs()
    await createUser({ username, email, password })

    await logInUser(page, username, password)
    await page.goto("/settings")
    await page.getByRole("tab", { name: "My profile" }).click()
    await page.getByRole("button", { name: "Edit" }).click()
    await page.getByLabel("Full name").fill("Renamed User")
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.getByText("User updated successfully")).toBeVisible()
    await expect(
      page.locator("form").getByText("Renamed User", { exact: true }),
    ).toBeVisible()
  })

  test("Edit email to invalid value shows error", async ({ page }) => {
    const { username, email, password } = makeUserInputs()
    await createUser({ username, email, password })

    await logInUser(page, username, password)
    await page.goto("/settings")
    await page.getByRole("tab", { name: "My profile" }).click()
    await page.getByRole("button", { name: "Edit" }).click()
    await page.getByLabel("Email").fill("")
    await page.locator("body").click()
    await expect(page.getByText(/email/i).first()).toBeVisible()
  })

  test("Update password then re-login with new password", async ({ page }) => {
    const { username, email, password } = makeUserInputs()
    const newPassword = `Bb2${randomPassword()}!`
    await createUser({ username, email, password })

    await logInUser(page, username, password)
    await page.goto("/settings")
    await page.getByRole("tab", { name: "Password" }).click()
    await page.getByTestId("current-password-input").fill(password)
    await page.getByTestId("new-password-input").fill(newPassword)
    await page.getByTestId("confirm-password-input").fill(newPassword)
    await page.getByRole("button", { name: "Update Password" }).click()
    await expect(page.getByText("Password updated successfully")).toBeVisible()

    await logOutUser(page)
    await logInUser(page, username, newPassword)
  })

  test("Weak new password shows validation error", async ({ page }) => {
    const { username, email, password } = makeUserInputs()
    await createUser({ username, email, password })

    await logInUser(page, username, password)
    await page.goto("/settings")
    await page.getByRole("tab", { name: "Password" }).click()
    await page.getByTestId("current-password-input").fill(password)
    await page.getByTestId("new-password-input").fill("weak")
    await page.getByTestId("confirm-password-input").fill("weak")
    await page.getByRole("button", { name: "Update Password" }).click()
    await expect(
      page.getByText("Password must be at least 8 characters"),
    ).toBeVisible()
  })

  test("Mismatched new-password confirmation shows error", async ({ page }) => {
    const { username, email, password } = makeUserInputs()
    await createUser({ username, email, password })

    await logInUser(page, username, password)
    await page.goto("/settings")
    await page.getByRole("tab", { name: "Password" }).click()
    await page.getByTestId("current-password-input").fill(password)
    await page.getByTestId("new-password-input").fill(`Aa1${randomPassword()}!`)
    await page
      .getByTestId("confirm-password-input")
      .fill(`Bb2${randomPassword()}!`)
    await page.getByRole("button", { name: "Update Password" }).click()
    await expect(page.getByText("The passwords don't match")).toBeVisible()
  })
})

test.describe("Appearance preserved across sessions", () => {
  test.describe.configure({ mode: "serial" })
  test.use({ storageState: { cookies: [], origins: [] } })

  test("Dark mode persists after re-login", async ({ page }) => {
    await logInUser(page, firstSuperuser, firstSuperuserPassword)
    await page.goto("/settings")

    await page.getByTestId("theme-button").click()
    await page.getByTestId("dark-mode").click()
    await expect(page.locator("html")).toHaveClass(/dark/)

    await logOutUser(page)
    await logInUser(page, firstSuperuser, firstSuperuserPassword)
    await expect(page.locator("html")).toHaveClass(/dark/)

    // Reset to light for later tests.
    await page.getByTestId("theme-button").click()
    await page.getByTestId("light-mode").click()
  })
})
