import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/api-dev/apis/$id/edit")({
  component: ApiEdit,
  head: () => ({
    meta: [
      {
        title: "Edit API",
      },
    ],
  }),
})

function ApiEdit() {
  const { id } = Route.useParams()
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Edit API</h1>
      <p className="text-muted-foreground">
        Edit API ID: {id}
      </p>
      {/* TODO: Task 5.3 - Implement API edit form (SQL/Script editor, params, debug) */}
    </div>
  )
}
