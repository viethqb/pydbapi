import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router"
import { BookOpen, Code, Database, FileCode, Globe, Lock, Zap } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const Route = createFileRoute("/_layout/about")({
  component: About,
  head: () => ({
    meta: [
      {
        title: "About & Documentation",
      },
    ],
  }),
})

function About() {
  const matchRoute = useMatchRoute()
  const isSqlJinjaRoute = matchRoute({ to: "/about/sql-jinja" })
  const isPythonScriptRoute = matchRoute({ to: "/about/python-script" })

  const activeTab = isSqlJinjaRoute ? "sql-jinja" : isPythonScriptRoute ? "python-script" : "overview"

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">About & Documentation</h1>
        <p className="text-muted-foreground mt-1">
          Learn how to use pyDBAPI to build and manage database APIs
        </p>
      </div>

      <Tabs value={activeTab} className="w-full">
        <TabsList>
          <TabsTrigger value="overview" asChild>
            <Link to="/about">Overview</Link>
          </TabsTrigger>
          <TabsTrigger value="sql-jinja" asChild>
            <Link to="/about/sql-jinja">SQL (Jinja2)</Link>
          </TabsTrigger>
          <TabsTrigger value="python-script" asChild>
            <Link to="/about/python-script">Python Script</Link>
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          {activeTab === "overview" && <OverviewContent />}
          <Outlet />
        </div>
      </Tabs>
    </div>
  )
}

function OverviewContent() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            What is pyDBAPI?
          </CardTitle>
          <CardDescription>
            A database API platform for turning SQL and Python into secure, versioned HTTP APIs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            pyDBAPI connects to your databases (<strong className="text-foreground">PostgreSQL</strong>,{" "}
            <strong className="text-foreground">MySQL</strong>,{" "}
            <strong className="text-foreground">Trino</strong>, and compatible protocols like StarRocks and RisingWave),
            lets you define API endpoints with{" "}
            <strong className="text-foreground">SQL (Jinja2 templates)</strong> or{" "}
            <strong className="text-foreground">Python scripts</strong>, and exposes them through a{" "}
            <strong className="text-foreground">dynamic gateway</strong> with authentication, rate limiting,
            concurrency control, and version management.
          </p>

          <div className="grid gap-4 md:grid-cols-2 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileCode className="h-4 w-4" />
                  SQL (Jinja2)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Write SQL queries with Jinja2 templating for dynamic parameters, conditional logic, and loops.
                  Built-in filters prevent SQL injection.
                </p>
                <Link
                  to="/about/sql-jinja"
                  className="text-sm text-primary hover:underline font-medium"
                >
                  View SQL guide →
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  Python Script
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Execute Python in a secure sandbox with database access, HTTP client, caching,
                  transaction control, and logging.
                </p>
                <Link
                  to="/about/python-script"
                  className="text-sm text-primary hover:underline font-medium"
                >
                  View Python guide →
                </Link>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Quick Start
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                1
              </div>
              <div>
                <h4 className="font-semibold">Create a Data Source</h4>
                <p className="text-sm text-muted-foreground">
                  Go to <Link to="/connection" className="text-primary hover:underline">Connection</Link> and
                  add your database (PostgreSQL, MySQL, or Trino). Configure host, port, database, and credentials.
                  Use <strong className="text-foreground">Test</strong> to verify connectivity.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                2
              </div>
              <div>
                <h4 className="font-semibold">Create a Module</h4>
                <p className="text-sm text-muted-foreground">
                  Go to <Link to="/api-dev/modules" className="text-primary hover:underline">API Dev → Modules</Link> and
                  create a module to organize your APIs. Modules group related endpoints together
                  (the module name is not part of the gateway URL).
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                3
              </div>
              <div>
                <h4 className="font-semibold">Create an API</h4>
                <p className="text-sm text-muted-foreground">
                  Go to <Link to="/api-dev/apis" className="text-primary hover:underline">API Dev → APIs</Link> and
                  create a new endpoint. Choose SQL (Jinja2) or Python Script engine, select a data source,
                  define the path and HTTP method, write your content, configure parameters, and test with Debug.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                4
              </div>
              <div>
                <h4 className="font-semibold">Publish and Call</h4>
                <p className="text-sm text-muted-foreground">
                  Create a <strong className="text-foreground">version commit</strong> (a snapshot of your content, parameters, and transforms),
                  then <strong className="text-foreground">publish</strong> it. The API becomes live at{" "}
                  <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">GET|POST /api/{"your-path"}</code>.
                  You can roll back by publishing an older version.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  For <strong className="text-foreground">private APIs</strong>: create a Client in{" "}
                  <Link to="/system/clients" className="text-primary hover:underline">System → Clients</Link>,
                  generate a token via{" "}
                  <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">POST /api/token/generate</code>{" "}
                  with <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">client_id</code> and{" "}
                  <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">client_secret</code>,
                  then pass it as <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">Authorization: Bearer &lt;token&gt;</code>.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Key Features</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <FileCode className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span><strong className="text-foreground">SQL Templates:</strong> Jinja2 syntax with custom SQL filters ({`sql_string`}, {`sql_int`}, {`in_list`}, {`sql_like`}, etc.) and the {`{% where %}`} tag for safe, dynamic queries.</span>
            </li>
            <li className="flex items-start gap-2">
              <Code className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span><strong className="text-foreground">Python Scripts:</strong> RestrictedPython sandbox with built-in helpers for database access ({`db`}), HTTP calls ({`http`}), caching ({`cache`}), transactions ({`tx`}), logging ({`log`}), and environment variables ({`env`}).</span>
            </li>
            <li className="flex items-start gap-2">
              <Zap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span><strong className="text-foreground">Typed Parameters:</strong> Define query/header/body parameters with data types (string, integer, number, boolean, array, object), defaults, and validation (regex or Python script). Automatic type coercion before execution.</span>
            </li>
            <li className="flex items-start gap-2">
              <BookOpen className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span><strong className="text-foreground">Versioning:</strong> Version commits snapshot content, parameters, and transforms. Publish specific versions to the gateway. Roll back by publishing an older version.</span>
            </li>
            <li className="flex items-start gap-2">
              <FileCode className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span><strong className="text-foreground">Macros:</strong> Reusable SQL/Python snippets scoped per module. Jinja macros for SQL fragments, Python macros for helper functions. Auto-prepended to API content, validations, and transforms.</span>
            </li>
            <li className="flex items-start gap-2">
              <Lock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span><strong className="text-foreground">Access Control:</strong> Public or private APIs. JWT-based client authentication with per-client rate limits, concurrent limits, and custom token expiry.</span>
            </li>
            <li className="flex items-start gap-2">
              <Globe className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span><strong className="text-foreground">Gateway:</strong> Dynamic routing at <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">/api/{"{path}"}</code> with rate limiting, concurrency control, config caching, access logging, and optional camelCase response naming.</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
