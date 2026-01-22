import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/connection/$id/edit")({
  component: ConnectionEdit,
  head: () => ({
    meta: [
      {
        title: "Edit DataSource",
      },
    ],
  }),
})

function ConnectionEdit() {
  const { id } = Route.useParams()
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Edit Data Source</h1>
      <p className="text-muted-foreground">
        Edit DataSource ID: {id}
      </p>
      {/* TODO: Task 5.2 - Implement DataSource edit form */}
    </div>
  )
}
