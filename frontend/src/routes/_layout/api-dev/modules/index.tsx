import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/api-dev/modules/")({
  component: ModulesList,
  head: () => ({
    meta: [
      {
        title: "API Modules",
      },
    ],
  }),
})

function ModulesList() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">API Modules</h1>
      <p className="text-muted-foreground">
        Manage your API modules
      </p>
      {/* TODO: Task 5.3 - Implement Module list */}
    </div>
  )
}
