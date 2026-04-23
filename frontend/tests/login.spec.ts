/**
 * Login page E2E: input visibility, happy path, invalid credentials,
 * logout, protected-route redirect, and invalid-token recovery.
 *
 * These tests run without the shared `storageState` because they need to
 * exercise the login form itself.
 */
import { expect, type Page, test } from "@playwright/test"
import { firstSuperuser, firstSuperuserPassword } from "./config.ts"
import { randomPassword } from "./utils/random.ts"

test.use({ storageState: { cookies: [], origins: [] } })

const fillForm = async (page: Page, username: string, password: string) => {
  await page.getByTestId("username-input").fill(username)
  await page.getByTestId("password-input").fill(password)
}

const submit = (page: Page) =>
  page.getByRole("button", { name: /log in/i }).click()

test("Inputs are visible, empty and editable", async ({ page }) => {
  await page.goto("/login")
  for (const id of ["username-input", "password-input"]) {
    const input = page.getByTestId(id)
    await expect(input).toBeVisible()
    await expect(input).toHaveValue("")
    await expect(input).toBeEditable()
  }
})

test("Log In button and Forgot Password link are visible", async ({ page }) => {
  await page.goto("/login")
  await expect(page.getByRole("button", { name: /log in/i })).toBeVisible()
  await expect(
    page.getByRole("link", { name: /forgot your password/i }),
  ).toBeVisible()
})

test("Log in with valid credentials lands on dashboard", async ({ page }) => {
  await page.goto("/login")
  await fillForm(page, firstSuperuser, firstSuperuserPassword)
  await submit(page)
  await page.waitForURL("/")
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
})

test("Empty username shows required error", async ({ page }) => {
  await page.goto("/login")
  const username = page.getByTestId("username-input")
  await username.focus()
  await username.blur()
  await expect(page.getByText("Username is required")).toBeVisible()
})

test("Wrong password shows error toast", async ({ page }) => {
  await page.goto("/login")
  await fillForm(page, firstSuperuser, randomPassword())
  await submit(page)
  // Backend returns "Incorrect username or password"; surfaced as a toast.
  await expect(page.getByText(/Incorrect username or password/i)).toBeVisible()
})

test("Log out returns to /login and blocks protected routes", async ({
  page,
}) => {
  await page.goto("/login")
  await fillForm(page, firstSuperuser, firstSuperuserPassword)
  await submit(page)
  await page.waitForURL("/")

  await page.getByTestId("user-menu").click()
  await page.getByRole("menuitem", { name: /log out/i }).click()
  await page.waitForURL("/login")

  await page.goto("/settings")
  await page.waitForURL("/login")
})

test("Redirects to /login when stored token is invalid", async ({ page }) => {
  await page.goto("/login")
  await page.evaluate(() => {
    localStorage.setItem("access_token", "invalid_token")
  })
  await page.goto("/settings")
  await page.waitForURL("/login")
  await expect(page).toHaveURL("/login")
})
