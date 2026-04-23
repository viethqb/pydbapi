/**
 * Smoke test: visit every top-level authenticated route and assert the page
 * heading rendered. Also fails if the page logs any console error/warning
 * (via the `consoleErrors` fixture), which catches regressions like React
 * controlled/uncontrolled warnings or failed API calls.
 */
import { expect, test } from "./utils/fixtures.ts"

type RouteCase = {
  name: string
  path: string
  heading: string | RegExp
}

const ROUTES: RouteCase[] = [
  { name: "dashboard", path: "/", heading: "Dashboard" },
  { name: "settings", path: "/settings", heading: "User Settings" },
  { name: "connection list", path: "/connection", heading: "Data Sources" },
  { name: "api-dev home", path: "/api-dev", heading: "API Development" },
  { name: "api-dev modules", path: "/api-dev/modules", heading: "Modules" },
  {
    name: "api-dev macro defs",
    path: "/api-dev/macro-defs",
    heading: "Macro definitions",
  },
  { name: "admin users", path: "/admin/users", heading: "Users" },
  {
    name: "report templates",
    path: "/report-management/templates",
    heading: "Report Templates",
  },
  {
    name: "report modules",
    path: "/report-management/modules",
    heading: /Report Modules/,
  },
  {
    name: "report executions",
    path: "/report-management/executions",
    heading: "Report Executions",
  },
  { name: "system clients", path: "/system/clients", heading: "Clients" },
  { name: "system groups", path: "/system/groups", heading: "Groups" },
  {
    name: "system access logs",
    path: "/system/access-logs",
    heading: "Access logs",
  },
]

for (const route of ROUTES) {
  test(`smoke: ${route.name} renders at ${route.path}`, async ({
    page,
    consoleErrors,
  }) => {
    await page.goto(route.path)
    await expect(
      page.getByRole("heading", { name: route.heading }).first(),
    ).toBeVisible()
    // consoleErrors fixture asserts empty at teardown
    void consoleErrors
  })
}
