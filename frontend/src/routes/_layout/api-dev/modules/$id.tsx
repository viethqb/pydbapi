import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/api-dev/modules/$id")({
  component: ModuleDetail,
  head: () => ({
    meta: [
      {
        title: "Module Detail",
      },
    ],
  }),
})

function ModuleDetail() {
  const { id } = Route.useParams()
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Module Detail</h1>
      <p className="text-muted-foreground">
        Module ID: {id}
      </p>
      {/* TODO: Task 5.3 - Implement Module detail + API list */}
    </div>
  )
}
