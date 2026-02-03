import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router"
import { BookOpen, Code, Database, FileCode } from "lucide-react"
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
          Learn how to use DBAPI to build and manage database APIs
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
            What is DBAPI?
          </CardTitle>
          <CardDescription>
            Database API platform for turning SQL and Python into secure, versioned HTTP APIs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            DBAPI is a platform for managing database connections and publishing them as HTTP APIs. You model{" "}
            <strong className="text-foreground">DataSources</strong>, organize them into{" "}
            <strong className="text-foreground">Modules</strong>, implement logic with{" "}
            <strong className="text-foreground">SQL (Jinja2)</strong> or{" "}
            <strong className="text-foreground">Python scripts</strong>, and expose everything through a{" "}
            <strong className="text-foreground">gateway</strong> with authentication, rate limiting, and
            version control.
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
                </p>
                <Link
                  to="/about/sql-jinja"
                  className="text-sm text-primary hover:underline font-medium"
                >
                  Learn more →
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
                  Execute Python scripts in a sandboxed environment with database access, HTTP clients, and caching.
                </p>
                <Link
                  to="/about/python-script"
                  className="text-sm text-primary hover:underline font-medium"
                >
                  Learn more →
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
            Quick Start Guide
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                1
              </div>
              <div>
                <h4 className="font-semibold">Create a DataSource</h4>
                <p className="text-sm text-muted-foreground">
                  Go to <Link to="/connection" className="text-primary hover:underline">Connection</Link> and add your database connection 
                  (PostgreSQL or MySQL). Configure host, port, database name, and credentials.
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
                  Go to <Link to="/api-dev/modules" className="text-primary hover:underline">API Dev → Modules</Link> and create a module 
                  to organize your APIs. Modules help group related APIs together.
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
                  Go to <Link to="/api-dev/apis" className="text-primary hover:underline">API Dev → APIs</Link> and create a new API. 
                  Choose between SQL (Jinja2) or Python Script execution engine, write your code, define parameters, and test it.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                4
              </div>
              <div>
                <h4 className="font-semibold">Publish & Call via Gateway</h4>
                <p className="text-sm text-muted-foreground">
                  Create a version of your API content, publish it, and access it via the generated endpoint on the gateway. 
                  For private APIs, create a Client and token, then call the API with the configured headers.
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
              <span className="text-primary mt-1">•</span>
              <span><strong className="text-foreground">Dynamic SQL Templates:</strong> Use Jinja2 syntax, custom filters, and helper tags to build safe, dynamic SQL from request parameters.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span><strong className="text-foreground">Python Script Engine:</strong> Run Python in a sandbox with helpers for database access, HTTP calls, caching, logging, and environment variables.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span><strong className="text-foreground">Versioned API Content:</strong> Track changes with commits and published versions so you can roll out or roll back behavior safely.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span><strong className="text-foreground">Strong Parameter Model:</strong> Define query/header/body parameters with data types, defaults, and validation (regex or Python) before they reach your engine.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span><strong className="text-foreground">Gateway & Access Control:</strong> Expose APIs via a gateway with public or private access, JWT-based clients, and per-client configuration.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span><strong className="text-foreground">Debug & Observability:</strong> Use the built-in Debug tab to test with parameters and inspect behavior before exposing APIs to consumers.</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
