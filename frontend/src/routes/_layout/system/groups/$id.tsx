import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { GroupsService } from "@/services/groups"
import { ApiAssignmentsService } from "@/services/api-assignments"
import { ModulesService } from "@/services/modules"
import { cn } from "@/lib/utils"

type ApiWithMeta = Awaited<ReturnType<typeof ApiAssignmentsService.get>> & {
  moduleName: string
  fullPath: string
}

function buildApiPath(
  module: { path_prefix: string; name: string } | null,
  api: { path: string },
): string {
  if (!module) return ""
  const apiPath = api.path.startsWith("/") ? api.path.slice(1) : api.path
  const isRootModule = !module.path_prefix || module.path_prefix.trim() === "/"
  return isRootModule ? `/${apiPath}` : `/${module.path_prefix.trim().replace(/^\/+|\/+$/g, "")}/${apiPath}`
}

export const Route = createFileRoute("/_layout/system/groups/$id")({
  component: GroupDetailPage,
  head: () => ({
    meta: [
      {
        title: "Group Detail - System",
      },
    ],
  }),
})

function GroupDetailPage() {
  const { id } = Route.useParams()

  const { data: group, isLoading } = useQuery({
    queryKey: ["group", id],
    queryFn: () => GroupsService.get(id),
  })

  const { data: apis, isLoading: apisLoading } = useQuery({
    queryKey: ["group-apis", id, group?.api_assignment_ids ?? []],
    queryFn: async (): Promise<ApiWithMeta[]> => {
      if (!group?.api_assignment_ids?.length) return []
      const results = await Promise.allSettled(
        group.api_assignment_ids.map((aid) => ApiAssignmentsService.get(aid)),
      )
      const list = results
        .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof ApiAssignmentsService.get>>> => r.status === "fulfilled")
        .map((r) => r.value)
      if (!list.length) return []
      const modules = await ModulesService.listSimple()
      const moduleMap = new Map(modules.map((m) => [m.id, m]))
      return list.map((api) => {
        const mod = moduleMap.get(api.module_id) ?? null
        return {
          ...api,
          moduleName: mod?.name ?? "-",
          fullPath: buildApiPath(mod, api),
        }
      })
    },
    enabled: !!group?.api_assignment_ids?.length,
  })

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">Loading...</div>
    )
  }

  if (!group) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <p className="text-muted-foreground">Group not found</p>
        <Link to="/system/groups">
          <Button variant="outline">Back to Groups</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link to="/system/groups">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{group.name}</h1>
          <p className="text-muted-foreground">
            {group.description || "Group detail and APIs"}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Group info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <span className="text-sm font-medium text-muted-foreground">
                Name
              </span>
              <p className="mt-1">{group.name}</p>
            </div>
            <div>
              <span className="text-sm font-medium text-muted-foreground">
                Status
              </span>
              <p className="mt-1">
                <span
                  className={cn(
                    "inline-flex size-2 rounded-full mr-1.5",
                    group.is_active ? "bg-green-500" : "bg-gray-400",
                  )}
                />
                {group.is_active ? "Active" : "Inactive"}
              </p>
            </div>
            {group.description && (
              <div className="md:col-span-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Description
                </span>
                <p className="mt-1">{group.description}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>APIs in this group</CardTitle>
          <p className="text-sm text-muted-foreground">
            {group.api_assignment_ids?.length ?? 0} API
            {(group.api_assignment_ids?.length ?? 0) !== 1 ? "s" : ""} assigned
          </p>
        </CardHeader>
        <CardContent>
          {apisLoading ? (
            <div className="text-center py-6 text-muted-foreground">
              Loading APIs...
            </div>
          ) : !apis?.length ? (
            <div className="text-center py-6 text-muted-foreground">
              No APIs assigned to this group
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead>Full path</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Engine</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apis.map((api) => (
                  <TableRow key={api.id}>
                    <TableCell className="font-medium">{api.name}</TableCell>
                    <TableCell>
                      <Link
                        to="/api-dev/modules/$id"
                        params={{ id: api.module_id }}
                        className="text-primary hover:underline"
                      >
                        {api.moduleName}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{api.path}</TableCell>
                    <TableCell>
                      {api.fullPath ? (
                        <a
                          href={
                            (import.meta.env.VITE_API_URL || window.location.origin) + api.fullPath
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-sm text-primary hover:underline max-w-[200px] truncate block"
                          title={
                            (import.meta.env.VITE_API_URL || window.location.origin) + api.fullPath
                          }
                        >
                          {api.fullPath}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{api.http_method}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{api.execute_engine}</Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "size-2 rounded-full inline-block mr-1.5",
                          api.is_published ? "bg-green-500" : "bg-gray-400",
                        )}
                      />
                      {api.is_published ? "Yes" : "No"}
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/api-dev/apis/$id"
                        params={{ id: api.id }}
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        View
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
