import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, Save, X } from "lucide-react"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import useCustomToast from "@/hooks/useCustomToast"
import { PermissionsService } from "@/services/permissions"
import { RolesService } from "@/services/roles"

const ROLES_LIST = "/admin/roles/"

function normId(id: string) {
  return String(id).replace(/-/g, "").toLowerCase()
}

export const Route = createFileRoute("/_layout/admin/roles/create")({
  component: CreateRolePage,
  head: () => ({ meta: [{ title: "Create Role - Admin" }] }),
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
  access_log: "Access log",
}

function CreateRolePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const { data: rolesData } = useQuery({
    queryKey: ["roles"],
    queryFn: () => RolesService.list(),
  })

  const { data: permsData, isLoading: permsLoading } = useQuery({
    queryKey: ["permissions"],
    queryFn: () => PermissionsService.list(),
  })

  const { data: resourceNames } = useQuery({
    queryKey: ["permissions", "resource-names"],
    queryFn: () => PermissionsService.getResourceNames(),
  })

  const rolesList = rolesData?.data ?? []

  const [name, setName] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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

  const permissionRows = useMemo(() => {
    const list = permsData?.data ?? []
    return list
      .map((p) => ({
        id: p.id,
        resource_type: p.resource_type,
        label: `${p.resource_type}:${getResourceName(p.resource_type, p.resource_id)}:${p.action}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [permsData, getResourceName])

  const permissionRowsByType = useMemo(() => {
    const order = [
      "datasource",
      "module",
      "group",
      "api_assignment",
      "macro_def",
      "client",
      "user",
      "overview",
      "access_log",
    ]
    const byType = new Map<string, typeof permissionRows>()
    for (const row of permissionRows) {
      const rows = byType.get(row.resource_type) ?? []
      rows.push(row)
      byType.set(row.resource_type, rows)
    }
    return order
      .filter((t) => byType.has(t))
      .map((t) => [t, RESOURCE_TYPE_LABELS[t] ?? t, byType.get(t) ?? []] as const)
  }, [permissionRows])

  const togglePermission = (permId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(permId)
      else next.delete(permId)
      return next
    })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      RolesService.create({
        name: name.trim(),
        permission_ids: Array.from(selectedIds),
      }),
    onSuccess: (created) => {
      showSuccessToast("Role created successfully")
      queryClient.invalidateQueries({ queryKey: ["roles"] })
      navigate({ to: "/admin/roles/$id/edit", params: { id: created.id } })
    },
    onError: (e: Error) => showErrorToast(e.message),
  })

  const handleRoleSelect = (value: string) => {
    if (value === "__new__") return
    navigate({ to: "/admin/roles/$id/edit", params: { id: value } })
  }

  return (
    <div className="flex flex-col gap-0">
      <div className="bg-muted/50 border-b px-4 py-3 mb-4 rounded-t-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <Label className="text-xs text-muted-foreground">Role</Label>
            <Select value="__new__" onValueChange={handleRoleSelect}>
              <SelectTrigger className="w-full max-w-md h-10 font-medium">
                <SelectValue placeholder="Create role" />
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
            <Link to={ROLES_LIST}>
              <Button variant="outline" size="sm">
                Back to list
              </Button>
            </Link>
            <LoadingButton
              size="sm"
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={!name.trim()}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Create
            </LoadingButton>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Create a new role by setting name and permissions.
        </p>
      </div>

      <Card className="rounded-t-lg border-b-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="max-w-md space-y-1.5">
            <Label
              htmlFor="role-name"
              className="text-sm font-normal text-muted-foreground"
            >
              Name
            </Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Role name"
              className="h-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-b-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Permissions</CardTitle>
          <p className="text-sm text-muted-foreground font-normal mt-0.5">
            Select permissions by group (Datasource, Module, …). When closed, only selected
            permissions are shown.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {permsLoading ? (
            <div className="text-sm text-muted-foreground py-4">Loading permissions…</div>
          ) : (
            <div className="space-y-3">
              {permissionRowsByType.map(([typeKey, typeLabel, rows]) => {
                const selectedInType = rows.filter((r) => selectedIds.has(r.id))
                return (
                  <div key={typeKey} className="space-y-1.5">
                    <Label className="text-sm font-medium">{typeLabel}</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <div className="flex min-h-[40px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-pointer">
                          <div className="flex flex-wrap gap-1 flex-1">
                            {selectedInType.length > 0 ? (
                              selectedInType.map((row) => (
                                <Badge
                                  key={row.id}
                                  variant="secondary"
                                  className="mr-1 font-mono text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    togglePermission(row.id, false)
                                  }}
                                >
                                  {row.label}
                                  <button
                                    type="button"
                                    className="ml-1 rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") togglePermission(row.id, false)
                                    }}
                                    onMouseDown={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                    }}
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      togglePermission(row.id, false)
                                    }}
                                  >
                                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                  </button>
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground">
                                Select {typeLabel.toLowerCase()}…
                              </span>
                            )}
                          </div>
                          <ChevronDown className="h-4 w-4 opacity-50 ml-2 shrink-0" />
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-[300px] overflow-auto"
                        align="start"
                      >
                        {rows.map((row) => (
                          <DropdownMenuItem
                            key={row.id}
                            onSelect={(e) => {
                              e.preventDefault()
                              togglePermission(row.id, !selectedIds.has(row.id))
                            }}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(row.id)}
                                readOnly
                                className="h-4 w-4 rounded border-gray-300"
                              />
                              <span className="font-mono text-xs truncate" title={row.label}>
                                {row.label}
                              </span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-b-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Users</CardTitle>
          <p className="text-sm text-muted-foreground font-normal mt-0.5">
            Users can be assigned after creating the role.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-sm text-muted-foreground py-4 border rounded-md bg-muted/20 text-center">
            No users yet.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

