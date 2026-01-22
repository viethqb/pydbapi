import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/api-repository/$id")({
  component: ApiRepositoryDetail,
  head: () => ({
    meta: [
      {
        title: "API Detail - Repository",
      },
    ],
  }),
})

function ApiRepositoryDetail() {
  const { id } = Route.useParams()
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">API Detail</h1>
      <p className="text-muted-foreground">
        API ID: {id}
      </p>
      {/* TODO: Task 5.5 - Implement API Repository detail (Swagger-like, Try it) */}
    </div>
  )
}
