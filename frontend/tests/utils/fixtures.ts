/**
 * Shared Playwright fixtures for E2E tests.
 *
 * - `consoleErrors`: captures browser console errors/warnings; test fails
 *   at teardown if any are recorded (React controlled/uncontrolled,
 *   key prop warnings, unhandled promise rejections, etc.).
 *   Opt out per-test with `test.use({ allowConsoleErrors: true })`.
 */
import { test as base, expect } from "@playwright/test"

type Fixtures = {
  consoleErrors: string[]
  allowConsoleErrors: boolean
}

const IGNORED_PATTERNS: RegExp[] = [
  // React DevTools tip in development builds
  /Download the React DevTools/,
  // Vite HMR noise
  /\[vite\]/i,
  // Failed API calls surface as console errors; those are asserted by UI
  // state in individual specs, not by this global guard.
  /Failed to load resource/,
]

export const test = base.extend<Fixtures>({
  allowConsoleErrors: [false, { option: true }],

  consoleErrors: async ({ page, allowConsoleErrors }, use) => {
    const errors: string[] = []

    const shouldIgnore = (text: string) =>
      IGNORED_PATTERNS.some((p) => p.test(text))

    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        const text = msg.text()
        if (!shouldIgnore(text)) errors.push(`[${msg.type()}] ${text}`)
      }
    })
    page.on("pageerror", (err) => {
      errors.push(`[pageerror] ${err.message}`)
    })

    await use(errors)

    if (!allowConsoleErrors) {
      expect(
        errors,
        `Unexpected console errors/warnings:\n${errors.join("\n")}`,
      ).toEqual([])
    }
  },
})

export { expect }
