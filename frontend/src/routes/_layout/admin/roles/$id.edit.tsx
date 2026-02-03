import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, Plus, Save, UserMinus, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { UsersService, type UserPublic as ClientUserPublic } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import useCustomToast from "@/hooks/useCustomToast"
import { PermissionsService } from "@/services/permissions"
import { RolesService, type UserPublic as RoleUserPublic } from "@/services/roles"
import { UserPermissionsService } from "@/services/user-permissions"

const ROLES_BASE = "/admin/roles"
const ROLES_LIST = `${ROLES_BASE}/`

function normId(id: string) {
  return String(id).replace(/-/g, "").toLowerCase()
}

export const Route = createFileRoute("/_layout/admin/roles/$id/edit")({
  component: RoleEditPage,
  head: () => ({ meta: [{ title: "Edit Role - Admin" }] }),
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

function RoleEditPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // Debug: log once when edit page mounts
  useEffect(() => {
    console.log("[Role edit page] mounted", {
      id,
      pathname: typeof window !== "undefined" ? window.location.pathname : "",
      routeId: router.state.location.routeId,
      fullPath: router.state.location.pathname,
    })
  }, [id, router.state.location.routeId, router.state.location.pathname])

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

  const [name, setName] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [addUserSelectedId, setAddUserSelectedId] = useState<string>("")
  const syncedRoleIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!role) return
    if (syncedRoleIdRef.current === role.id) return
    syncedRoleIdRef.current = role.id
    setName(role.name)
    setSelectedIds(new Set(role.permission_ids ?? []))
  }, [role])

  const moduleNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of resourceNames?.modules ?? []) {
      map.set(normId(m.id), m.name)
    }
    return map
  }, [resourceNames])

  const datasourceNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const ds of resourceNames?.datasources ?? []) {
      map.set(normId(ds.id), ds.name)
    }
    return map
  }, [resourceNames])

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const g of resourceNames?.groups ?? []) {
      map.set(normId(g.id), g.name)
    }
    return map
  }, [resourceNames])

  const apiAssignmentNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of resourceNames?.api_assignments ?? []) {
      map.set(normId(a.id), a.name)
    }
    return map
  }, [resourceNames])

  const macroDefNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of resourceNames?.macro_defs ?? []) {
      map.set(normId(m.id), m.name)
    }
    return map
  }, [resourceNames])

  const clientNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of resourceNames?.clients ?? []) {
      map.set(normId(c.id), c.name)
    }
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

  /** Flat list of permissions as resource_type:name:action */
  const permissionRows = useMemo(() => {
    const list = permsData?.data ?? []
    return list
      .map((p) => ({
        id: p.id,
        resource_type: p.resource_type,
        action: p.action,
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
    ]
    const byType = new Map<string, typeof permissionRows>()
    for (const row of permissionRows) {
      const list = byType.get(row.resource_type) ?? []
      list.push(row)
      byType.set(row.resource_type, list)
    }
    return order
      .filter((t) => byType.has(t))
      .map((t) => [t, RESOURCE_TYPE_LABELS[t] ?? t, byType.get(t) ?? []] as const)
  }, [permissionRows])

  const updateMutation = useMutation({
    mutationFn: () =>
      RolesService.update(id, {
        name: name || undefined,
        permission_ids: Array.from(selectedIds),
      }),
    onSuccess: () => {
      showSuccessToast("Role updated successfully")
      queryClient.invalidateQueries({ queryKey: ["role", id] })
      queryClient.invalidateQueries({ queryKey: ["roles"] })
    },
    onError: (e: Error) => showErrorToast(e.message),
  })

  const togglePermission = (permId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(permId)
      else next.delete(permId)
      return next
    })
  }

  const roleUsers = roleUsersData?.data ?? []
  const rolesList = rolesData?.data ?? []

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
      navigate({ to: "/admin/roles/$id/edit", params: { id: value } })
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
            <Link to="/admin/roles/$id" params={{ id }}>
              <Button variant="outline" size="sm">
                View details
              </Button>
            </Link>
            <Link to={ROLES_LIST}>
              <Button variant="outline" size="sm">
                Back to list
              </Button>
            </Link>
            <LoadingButton
              size="sm"
              onClick={() => updateMutation.mutate()}
              loading={updateMutation.isPending}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Save
            </LoadingButton>
          </div>
        </div>
        {role && (
          <p className="text-xs text-muted-foreground mt-1">
            {role.user_count} user(s) · Update name, permissions and users
          </p>
        )}
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
            <div className="text-sm text-muted-foreground py-4">
              Loading permissions…
            </div>
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
                                      if (e.key === "Enter") {
                                        togglePermission(row.id, false)
                                      }
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
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base">Users</CardTitle>
              <p className="text-sm text-muted-foreground font-normal mt-0.5">
                Users assigned to this role. Add or remove below.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddUserOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add user
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {usersLoading ? (
            <div className="text-sm text-muted-foreground py-4">
              Loading users…
            </div>
          ) : roleUsers.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 border rounded-md bg-muted/20 text-center">
              No users assigned. Click &quot;Add user&quot; to assign.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Full name</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roleUsers.map((u) => (
                  <RoleUserRow
                    key={u.id}
                    user={u}
                    roleId={id}
                    onRemoved={() => {
                      queryClient.invalidateQueries({ queryKey: ["roleUsers", id] })
                      queryClient.invalidateQueries({ queryKey: ["role", id] })
                      queryClient.invalidateQueries({ queryKey: ["roles"] })
                    }}
                    showError={showErrorToast}
                    showSuccess={showSuccessToast}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddUserToRoleDialog
        open={addUserOpen}
        onOpenChange={setAddUserOpen}
        roleId={id}
        currentUserIds={roleUsers.map((u) => u.id)}
        onAdded={() => {
          queryClient.invalidateQueries({ queryKey: ["roleUsers", id] })
          queryClient.invalidateQueries({ queryKey: ["role", id] })
          queryClient.invalidateQueries({ queryKey: ["roles"] })
          setAddUserOpen(false)
          setAddUserSelectedId("")
        }}
        showError={showErrorToast}
        showSuccess={showSuccessToast}
        selectedUserId={addUserSelectedId}
        onSelectUserId={setAddUserSelectedId}
      />
    </div>
  )
}

function RoleUserRow({
  user,
  roleId,
  onRemoved,
  showError,
  showSuccess,
}: {
  user: RoleUserPublic
  roleId: string
  onRemoved: () => void
  showError: (m: string) => void
  showSuccess: (m: string) => void
}) {
  const removeMutation = useMutation({
    mutationFn: async () => {
      const { role_ids } = await UserPermissionsService.getUserRoles(user.id)
      const next = role_ids.filter((r) => r !== roleId)
      return UserPermissionsService.updateUserRoles(user.id, next)
    },
    onSuccess: () => {
      showSuccess("User removed from role")
      onRemoved()
    },
    onError: (e: Error) => showError(e.message),
  })

  return (
    <TableRow>
      <TableCell className="font-medium">{user.email}</TableCell>
      <TableCell>{user.full_name ?? "—"}</TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => removeMutation.mutate()}
          disabled={removeMutation.isPending}
        >
          <UserMinus className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  )
}

function AddUserToRoleDialog({
  open,
  onOpenChange,
  roleId,
  currentUserIds,
  onAdded,
  showError,
  showSuccess,
  selectedUserId,
  onSelectUserId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roleId: string
  currentUserIds: string[]
  onAdded: () => void
  showError: (m: string) => void
  showSuccess: (m: string) => void
  selectedUserId: string
  onSelectUserId: (id: string) => void
}) {
  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => UsersService.readUsers({ skip: 0, limit: 200 }),
    enabled: open,
  })

  const addMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { role_ids } = await UserPermissionsService.getUserRoles(userId)
      if (role_ids.includes(roleId)) return
      return UserPermissionsService.updateUserRoles(userId, [...role_ids, roleId])
    },
    onSuccess: () => {
      showSuccess("User added to role")
      onAdded()
    },
    onError: (e: Error) => showError(e.message),
  })

  const availableUsers = useMemo(() => {
    const list = usersData?.data ?? []
    return list.filter((u: ClientUserPublic) => !currentUserIds.includes(u.id))
  }, [usersData, currentUserIds])

  const handleAdd = () => {
    if (!selectedUserId) return
    addMutation.mutate(selectedUserId)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user to role</DialogTitle>
          <DialogDescription>
            Select a user to assign this role. Users who already have this role
            are not listed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">User</Label>
          <Select value={selectedUserId} onValueChange={onSelectUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Select user…" />
            </SelectTrigger>
            <SelectContent>
              {availableUsers.map((u: ClientUserPublic) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.email} {u.full_name ? `(${u.full_name})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <LoadingButton
            onClick={handleAdd}
            loading={addMutation.isPending}
            disabled={!selectedUserId}
          >
            Add
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

