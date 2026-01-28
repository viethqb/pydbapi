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
            Database API Management System
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            DBAPI is a comprehensive platform for managing database connections, API development, and system configuration. 
            It allows you to create RESTful APIs from SQL queries and Python scripts without writing backend code.
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
                <h4 className="font-semibold">Publish & Use</h4>
                <p className="text-sm text-muted-foreground">
                  Create a version of your API content, publish it, and access it via the generated endpoint. 
                  Private APIs require authentication tokens.
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
              <span><strong className="text-foreground">Dynamic SQL Templates:</strong> Use Jinja2 syntax for conditional queries, loops, and parameter injection</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span><strong className="text-foreground">Python Script Execution:</strong> Run Python code in a secure sandbox with database, HTTP, and cache access</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span><strong className="text-foreground">Version Control:</strong> Track changes to your API content with versioning and commit messages</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span><strong className="text-foreground">Parameter Validation:</strong> Define parameters with types, validation rules, and default values</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span><strong className="text-foreground">Access Control:</strong> Public APIs (no auth) or Private APIs (token-based authentication)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span><strong className="text-foreground">Debug & Test:</strong> Test your APIs with custom parameters before publishing</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
