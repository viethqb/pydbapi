import { createFileRoute, Link } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Plus, Save, Search, UserMinus } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { UsersService, type UserPublic as ClientUserPublic } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PermissionsService } from "@/services/permissions"
import { RolesService, type UserPublic as RoleUserPublic } from "@/services/roles"
import { UserPermissionsService } from "@/services/user-permissions"
import useCustomToast from "@/hooks/useCustomToast"

const ROLES_BASE = "/security/roles"
const ROLES_LIST = `${ROLES_BASE}/`

export const Route = createFileRoute("/_layout/security/roles/$id")({
  component: RoleDetailPage,
  head: () => ({ meta: [{ title: "Edit Role - Security" }] }),
})

/** Group key: "resource_type:all" or "resource_type:resource_id" for scope (all vs specific). */
function groupByResourceAndScope(
  perms: {
    id: string
    resource_type: string
    action: string
    resource_id: string | null
  }[],
): Map<string, { id: string; action: string; resource_id: string | null }[]> {
  const map = new Map<
    string,
    { id: string; action: string; resource_id: string | null }[]
  >()
  for (const p of perms) {
    const scope = p.resource_id == null ? "all" : p.resource_id
    const key = `${p.resource_type}:${scope}`
    const list = map.get(key) ?? []
    list.push({ id: p.id, action: p.action, resource_id: p.resource_id })
    map.set(key, list)
  }
  return map
}

/**
 * Edit role page – Superset-style:
 * Name, Permissions (recommend role / copy from role + search + grid), Users (list + add/remove).
 */
function RoleDetailPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const { data: role, isLoading: roleLoading } = useQuery({
    queryKey: ["role", id],
    queryFn: () => RolesService.get(id),
  })

  const { data: rolesList } = useQuery({
    queryKey: ["roles"],
    queryFn: () => RolesService.list(),
  })

  const { data: permsData, isLoading: permsLoading } = useQuery({
    queryKey: ["permissions"],
    queryFn: () => PermissionsService.list(),
  })

  const { data: roleUsersData, isLoading: usersLoading } = useQuery({
    queryKey: ["roleUsers", id],
    queryFn: () => RolesService.getRoleUsers(id),
    enabled: !!id,
  })

  const [name, setName] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [permSearch, setPermSearch] = useState("")
  const [recommendRoleId, setRecommendRoleId] = useState<string>("")
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

  const permissionGroups = useMemo(() => {
    if (!permsData?.data)
      return new Map<
        string,
        { id: string; action: string; resource_id: string | null }[]
      >()
    return groupByResourceAndScope(permsData.data)
  }, [permsData])

  const filteredPermissionEntries = useMemo(() => {
    const entries = Array.from(permissionGroups.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    )
    if (!permSearch.trim()) return entries
    const q = permSearch.trim().toLowerCase()
    return entries.filter(([groupKey]) => {
      const [resourceType, scopePart] = groupKey.split(":", 2)
      const scope =
        scopePart === "all" ? "all" : scopePart
      const label = `${resourceType} ${scope}`.toLowerCase()
      return label.includes(q)
    })
  }, [permissionGroups, permSearch])

  const applyRecommendRole = (roleId: string) => {
    const r = rolesList?.data?.find((x) => x.id === roleId)
    if (!r) return
    const detail = queryClient.getQueryData<{ permission_ids: string[] }>([
      "role",
      roleId,
    ])
    if (detail?.permission_ids) {
      setSelectedIds(new Set(detail.permission_ids))
      showSuccessToast(`Permissions copied from role "${r.name}"`)
    } else {
      RolesService.get(roleId).then((res) => {
        setSelectedIds(new Set(res.permission_ids ?? []))
        showSuccessToast(`Permissions copied from role "${res.name}"`)
      })
    }
  }

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

  const toggleAllForGroup = (groupKey: string, checked: boolean) => {
    const list = permissionGroups.get(groupKey) ?? []
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const p of list) {
        if (checked) next.add(p.id)
        else next.delete(p.id)
      }
      return next
    })
  }

  const roleUsers = roleUsersData?.data ?? []

  if (roleLoading || !role) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {roleLoading ? "Loading..." : "Role not found"}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0">
      {/* SubMenu-style bar */}
      <div className="bg-muted/50 border-b px-4 py-3 mb-4 rounded-t-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Link to={ROLES_LIST}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Edit role: {role.name}
              </h1>
              <p className="text-xs text-muted-foreground">
                {role.user_count} user(s) · Update name, permissions and users
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to={ROLES_LIST}>
              <Button variant="outline" size="sm">
                Cancel
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
      </div>

      {/* Section: Name (Details) */}
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

      {/* Section: Permissions – Superset-style: recommend role + search + grid */}
      <Card className="border-b-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Permissions</CardTitle>
          <p className="text-sm text-muted-foreground font-normal mt-0.5">
            Copy from a recommended role or search and select below. By resource
            and scope: All = entire type; ID = specific resource.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">
                Copy from role:
              </Label>
              <Select
                value={recommendRoleId}
                onValueChange={(value) => {
                  setRecommendRoleId(value)
                  if (value) applyRecommendRole(value)
                }}
              >
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Select role…" />
                </SelectTrigger>
                <SelectContent>
                  {(rolesList?.data ?? [])
                    .filter((r) => r.id !== id)
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search permissions (resource or scope)…"
                value={permSearch}
                onChange={(e) => setPermSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {permsLoading ? (
            <div className="text-sm text-muted-foreground py-4">
              Loading permissions…
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPermissionEntries.map(([groupKey, perms]) => {
                const [resourceType, scopePart] = groupKey.split(":", 2)
                const scope =
                  scopePart === "all"
                    ? "All"
                    : `ID: ${scopePart.slice(0, 8)}…`
                const label = `${resourceType.replace(/_/g, " ")} · ${scope}`
                return (
                  <div
                    key={groupKey}
                    className="rounded-md border bg-muted/20 p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`grp-${groupKey}`}
                        checked={perms.every((p) => selectedIds.has(p.id))}
                        onCheckedChange={(v) =>
                          toggleAllForGroup(groupKey, v === true)
                        }
                      />
                      <Label
                        htmlFor={`grp-${groupKey}`}
                        className="text-sm font-medium capitalize leading-none"
                      >
                        {label}
                      </Label>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pl-6">
                      {perms.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-1.5"
                        >
                          <Checkbox
                            id={p.id}
                            checked={selectedIds.has(p.id)}
                            onCheckedChange={(v) =>
                              togglePermission(p.id, v === true)
                            }
                          />
                          <Label
                            htmlFor={p.id}
                            className="text-xs font-normal text-muted-foreground cursor-pointer"
                          >
                            {p.action}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section: Users – list + add / remove */}
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
