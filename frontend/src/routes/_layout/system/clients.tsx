import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/system/clients")({
  component: ClientsPage,
  head: () => ({
    meta: [
      {
        title: "Clients - System",
      },
    ],
  }),
})

function ClientsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Clients</h1>
      <p className="text-muted-foreground">
        Manage application clients
      </p>
      {/* TODO: Task 5.4 - Implement Clients CRUD + regenerate secret */}
    </div>
  )
}
