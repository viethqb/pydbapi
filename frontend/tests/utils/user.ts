import { expect, type Page } from "@playwright/test"

/**
 * UI login helper for specs that need to log in as a non-superuser.
 * `identifier` is the `username` field (backend logs in by username).
 */
export async function logInUser(
  page: Page,
  identifier: string,
  password: string,
) {
  // Capture any console errors during login for easier debugging.
  const errors: string[] = []
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text())
  })
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))

  await page.goto("/login")
  await page.getByTestId("username-input").fill(identifier)
  await page.getByTestId("password-input").fill(password)
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("/api/v1/login/access-token") &&
        r.request().method() === "POST",
      { timeout: 15_000 },
    ),
    page.getByRole("button", { name: /log in/i }).click(),
  ])

  // Settle: either the dashboard heading + /users/me response is ready, or
  // an error toast is shown.
  try {
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
      timeout: 15_000,
    })
  } catch (err) {
    const url = page.url()
    throw new Error(
      `logInUser: did not land on dashboard.\n  url=${url}\n  console=${errors.join(" | ")}`,
    )
  }
}

export async function logOutUser(page: Page) {
  await page.getByTestId("user-menu").click()
  await page.getByRole("menuitem", { name: /log out/i }).click()
  await page.waitForURL("/login")
}
