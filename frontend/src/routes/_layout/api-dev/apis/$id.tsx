import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/api-dev/apis/$id")({
  component: ApiDetail,
  head: () => ({
    meta: [
      {
        title: "API Detail",
      },
    ],
  }),
})

function ApiDetail() {
  const { id } = Route.useParams()
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">API Detail</h1>
      <p className="text-muted-foreground">
        API ID: {id}
      </p>
      {/* TODO: Task 5.3 - Implement API detail */}
    </div>
  )
}
