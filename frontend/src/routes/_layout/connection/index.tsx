import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/connection/")({
  component: ConnectionList,
  head: () => ({
    meta: [
      {
        title: "Connection - DataSource List",
      },
    ],
  }),
})

function ConnectionList() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Data Sources</h1>
      <p className="text-muted-foreground">
        Manage your database connections
      </p>
      {/* TODO: Task 5.2 - Implement DataSource list */}
    </div>
  )
}
