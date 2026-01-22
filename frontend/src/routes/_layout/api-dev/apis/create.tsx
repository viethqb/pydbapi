import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/api-dev/apis/create")({
  component: ApiCreate,
  head: () => ({
    meta: [
      {
        title: "Create API",
      },
    ],
  }),
})

function ApiCreate() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Create API</h1>
      <p className="text-muted-foreground">
        Create a new API assignment
      </p>
      {/* TODO: Task 5.3 - Implement API create form (SQL/Script editor, params, debug) */}
    </div>
  )
}
