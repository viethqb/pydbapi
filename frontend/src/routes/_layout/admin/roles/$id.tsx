import { createFileRoute, Link, useNavigate, Outlet, useMatchRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Pencil } from "lucide-react"
import { useMemo } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PermissionsService } from "@/services/permissions"
import { RolesService } from "@/services/roles"

const ROLES_LIST = "/admin/roles/"

function normId(id: string) {
  return String(id).replace(/-/g, "").toLowerCase()
}

export const Route = createFileRoute("/_layout/admin/roles/$id")({
  component: RoleDetailViewPage,
  head: () => ({ meta: [{ title: "Role Details - Admin" }] }),
})

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  datasource: "Datasource",
  module: "Module",
  group: "Group",
  api_assignment: "API Assignment",
  macro_def: "Macro definition",
  client: "Client",
  user: "User",
  overview: "Overview",
}

function RoleDetailViewPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const isEditRoute = matchRoute({ to: "/admin/roles/$id/edit" })

  const { data: rolesData } = useQuery({
    queryKey: ["roles"],
    queryFn: () => RolesService.list(),
  })

  const { data: role, isLoading: roleLoading } = useQuery({
    queryKey: ["role", id],
    queryFn: () => RolesService.get(id),
  })

  const { data: permsData, isLoading: permsLoading } = useQuery({
    queryKey: ["permissions"],
    queryFn: () => PermissionsService.list(),
  })

  const { data: resourceNames } = useQuery({
    queryKey: ["permissions", "resource-names"],
    queryFn: () => PermissionsService.getResourceNames(),
  })

  const { data: roleUsersData, isLoading: usersLoading } = useQuery({
    queryKey: ["roleUsers", id],
    queryFn: () => RolesService.getRoleUsers(id),
    enabled: !!id,
  })

  const rolesList = rolesData?.data ?? []
  const roleUsers = roleUsersData?.data ?? []
  const selectedIdSet = useMemo(
    () => new Set<string>((role?.permission_ids ?? []) as string[]),
    [role?.permission_ids],
  )

  const moduleNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of resourceNames?.modules ?? []) map.set(normId(m.id), m.name)
    return map
  }, [resourceNames])

  const datasourceNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const ds of resourceNames?.datasources ?? []) map.set(normId(ds.id), ds.name)
    return map
  }, [resourceNames])

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const g of resourceNames?.groups ?? []) map.set(normId(g.id), g.name)
    return map
  }, [resourceNames])

  const apiAssignmentNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of resourceNames?.api_assignments ?? []) map.set(normId(a.id), a.name)
    return map
  }, [resourceNames])

  const macroDefNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of resourceNames?.macro_defs ?? []) map.set(normId(m.id), m.name)
    return map
  }, [resourceNames])

  const clientNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of resourceNames?.clients ?? []) map.set(normId(c.id), c.name)
    return map
  }, [resourceNames])

  const getResourceName = useMemo(() => {
    return (resourceType: string, resourceId: string | null): string => {
      if (!resourceId) return "All"
      const key = normId(resourceId)
      switch (resourceType) {
        case "module":
          return moduleNameById.get(key) ?? `ID:${String(resourceId).slice(0, 8)}…`
        case "datasource":
          return datasourceNameById.get(key) ?? `ID:${String(resourceId).slice(0, 8)}…`
        case "group":
          return groupNameById.get(key) ?? `ID:${String(resourceId).slice(0, 8)}…`
        case "api_assignment":
          return apiAssignmentNameById.get(key) ?? `ID:${String(resourceId).slice(0, 8)}…`
        case "macro_def":
          return macroDefNameById.get(key) ?? `ID:${String(resourceId).slice(0, 8)}…`
        case "client":
          return clientNameById.get(key) ?? `ID:${String(resourceId).slice(0, 8)}…`
        default:
          return `ID:${String(resourceId).slice(0, 8)}…`
      }
    }
  }, [
    moduleNameById,
    datasourceNameById,
    groupNameById,
    apiAssignmentNameById,
    macroDefNameById,
    clientNameById,
  ])

  const selectedPermissionsByType = useMemo(() => {
    const list = permsData?.data ?? []
    const byType = new Map<string, { id: string; label: string }[]>()
    for (const p of list) {
      if (!selectedIdSet.has(p.id)) continue
      const label = `${p.resource_type}:${getResourceName(p.resource_type, p.resource_id)}:${p.action}`
      const rows = byType.get(p.resource_type) ?? []
      rows.push({ id: p.id, label })
      byType.set(p.resource_type, rows)
    }

    const order = [
      "datasource",
      "module",
      "group",
      "api_assignment",
      "macro_def",
      "client",
      "user",
      "overview",
    ]

    return order
      .filter((t) => (byType.get(t)?.length ?? 0) > 0)
      .map((t) => [t, RESOURCE_TYPE_LABELS[t] ?? t, byType.get(t) ?? []] as const)
  }, [permsData, selectedIdSet, getResourceName])

  // When URL is /admin/roles/:id/edit, render the edit child (Outlet), not the detail view
  if (isEditRoute) {
    console.log("[Role detail $id] rendering Outlet for edit child", { id })
    return <Outlet />
  }

  if (roleLoading || !role) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {roleLoading ? "Loading..." : "Role not found"}
      </div>
    )
  }

  const handleRoleSelect = (value: string) => {
    if (value === "__new__") {
      navigate({ to: "/admin/roles/create" })
      return
    }
    if (value !== id) {
      navigate({ to: "/admin/roles/$id", params: { id: value } })
    }
  }

  return (
    <div className="flex flex-col gap-0">
      <div className="bg-muted/50 border-b px-4 py-3 mb-4 rounded-t-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <Label className="text-xs text-muted-foreground">Role</Label>
            <Select value={id} onValueChange={handleRoleSelect}>
              <SelectTrigger className="w-full max-w-md h-10 font-medium">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">+ Create new role</SelectItem>
                {rolesList.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {r.description ? ` — ${r.description}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin/roles/$id/edit"
              params={{ id }}
              onClick={() => {
                console.log("[Role detail] Edit role clicked", {
                  id,
                  targetPath: `/admin/roles/${id}/edit`,
                })
              }}
            >
              <Button size="sm">
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit role
              </Button>
            </Link>
            <Link to={ROLES_LIST}>
              <Button variant="outline" size="sm">
                Back to list
              </Button>
            </Link>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {role.user_count ?? roleUsers.length} user(s) · View details
        </p>
      </div>

      <Card className="rounded-t-lg border-b-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="max-w-md space-y-1.5">
            <Label className="text-sm font-normal text-muted-foreground">Name</Label>
            <div className="text-sm font-medium">{role.name}</div>
            <Label className="text-sm font-normal text-muted-foreground pt-2">
              Description
            </Label>
            <div className="text-sm text-muted-foreground">
              {role.description ?? "—"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-b-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Permissions</CardTitle>
          <p className="text-sm text-muted-foreground font-normal mt-0.5">
            Selected permissions for this role.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {permsLoading ? (
            <div className="text-sm text-muted-foreground py-4">
              Loading permissions…
            </div>
          ) : selectedPermissionsByType.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 border rounded-md bg-muted/20 text-center">
              No permissions selected.
            </div>
          ) : (
            <div className="space-y-3">
              {selectedPermissionsByType.map(([typeKey, typeLabel, rows]) => (
                <div key={typeKey} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm font-medium">{typeLabel}</Label>
                    <span className="text-xs text-muted-foreground">
                      {rows.length} selected
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {rows
                      .slice()
                      .sort((a, b) => a.label.localeCompare(b.label))
                      .map((row) => (
                        <Badge
                          key={row.id}
                          variant="secondary"
                          className="font-mono text-xs"
                          title={row.label}
                        >
                          {row.label}
                        </Badge>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-b-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Users</CardTitle>
          <p className="text-sm text-muted-foreground font-normal mt-0.5">
            Users assigned to this role.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {usersLoading ? (
            <div className="text-sm text-muted-foreground py-4">Loading users…</div>
          ) : roleUsers.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 border rounded-md bg-muted/20 text-center">
              No users assigned. Go to edit to assign users.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Full name</TableHead>
                  <TableHead className="w-[80px] text-right">Go</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roleUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell>{u.full_name ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Link to="/admin/roles/$id/edit" params={{ id }}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <ArrowRight className="h-4 w-4" />
                        </Button>
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

