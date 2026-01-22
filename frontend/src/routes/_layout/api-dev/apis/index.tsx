import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/api-dev/apis/")({
  component: ApisList,
  head: () => ({
    meta: [
      {
        title: "API List",
      },
    ],
  }),
})

function ApisList() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">APIs</h1>
      <p className="text-muted-foreground">
        Manage your APIs
      </p>
      {/* TODO: Task 5.3 - Implement API list */}
    </div>
  )
}
