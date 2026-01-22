import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/api-repository/")({
  component: ApiRepository,
  head: () => ({
    meta: [
      {
        title: "API Repository",
      },
    ],
  }),
})

function ApiRepository() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">API Repository</h1>
      <p className="text-muted-foreground">
        Search and browse published APIs
      </p>
      {/* TODO: Task 5.5 - Implement API Repository search */}
    </div>
  )
}
