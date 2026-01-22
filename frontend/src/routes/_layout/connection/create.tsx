import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/connection/create")({
  component: ConnectionCreate,
  head: () => ({
    meta: [
      {
        title: "Create DataSource",
      },
    ],
  }),
})

function ConnectionCreate() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Create Data Source</h1>
      <p className="text-muted-foreground">
        Add a new database connection
      </p>
      {/* TODO: Task 5.2 - Implement DataSource create form */}
    </div>
  )
}
