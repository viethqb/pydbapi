import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/system/groups")({
  component: GroupsPage,
  head: () => ({
    meta: [
      {
        title: "Groups - System",
      },
    ],
  }),
})

function GroupsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Groups</h1>
      <p className="text-muted-foreground">
        Manage API groups
      </p>
      {/* TODO: Task 5.4 - Implement Groups CRUD */}
    </div>
  )
}
