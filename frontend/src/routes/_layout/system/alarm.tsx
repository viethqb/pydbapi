import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/system/alarm")({
  component: AlarmPage,
  head: () => ({
    meta: [
      {
        title: "Alarm - System",
      },
    ],
  }),
})

function AlarmPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Alarm</h1>
      <p className="text-muted-foreground">
        Manage alarm configurations
      </p>
      {/* TODO: Task 5.4 - Implement Alarm CRUD */}
    </div>
  )
}
