import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/about")({
  component: About,
  head: () => ({
    meta: [
      {
        title: "About",
      },
    ],
  }),
})

function About() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">About</h1>
      <div className="space-y-4">
        <p className="text-muted-foreground">
          DBAPI - Database API Management System
        </p>
        <p className="text-muted-foreground">
          A comprehensive platform for managing database connections, API development, and system configuration.
        </p>
      </div>
    </div>
  )
}
