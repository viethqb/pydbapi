import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/system/firewall")({
  component: FirewallPage,
  head: () => ({
    meta: [
      {
        title: "Firewall - System",
      },
    ],
  }),
})

function FirewallPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Firewall</h1>
      <p className="text-muted-foreground">
        Manage firewall rules
      </p>
      {/* TODO: Task 5.4 - Implement Firewall CRUD */}
    </div>
  )
}
