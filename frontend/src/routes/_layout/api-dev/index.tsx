import { createFileRoute, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const Route = createFileRoute("/_layout/api-dev/")({
  component: ApiDevLayout,
  head: () => ({
    meta: [
      {
        title: "API Development",
      },
    ],
  }),
})

function ApiDevLayout() {
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  
  const isModulesRoute = matchRoute({ to: "/api-dev/modules" }) || matchRoute({ to: "/api-dev/modules/" })
  const isApisRoute = matchRoute({ to: "/api-dev/apis" }) || matchRoute({ to: "/api-dev/apis/" })
  
  // Default to APIs if no specific route matched
  const activeTab = isModulesRoute ? "modules" : "apis"

  const handleTabChange = (value: string) => {
    if (value === "modules") {
      navigate({ to: "/api-dev/modules" })
    } else {
      navigate({ to: "/api-dev/apis" })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">API Development</h1>
        <p className="text-muted-foreground">
          Manage API modules and assignments
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="apis">APIs</TabsTrigger>
        </TabsList>
      </Tabs>

      <Outlet />
    </div>
  )
}
