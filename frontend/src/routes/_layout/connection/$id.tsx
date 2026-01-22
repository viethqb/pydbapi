import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/connection/$id")({
  component: ConnectionDetail,
  head: () => ({
    meta: [
      {
        title: "DataSource Detail",
      },
    ],
  }),
})

function ConnectionDetail() {
  const { id } = Route.useParams()
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Data Source Detail</h1>
      <p className="text-muted-foreground">
        DataSource ID: {id}
      </p>
      {/* TODO: Task 5.2 - Implement DataSource detail */}
    </div>
  )
}
