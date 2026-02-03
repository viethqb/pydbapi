import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, Plus, X } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"

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
  DialogTrigger,
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
import { Textarea } from "@/components/ui/textarea"
import { PermissionsService } from "@/services/permissions"
import { RolesService } from "@/services/roles"
import useCustomToast from "@/hooks/useCustomToast"

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

function normId(id: string) {
  return String(id).replace(/-/g, "").toLowerCase()
}

export default function CreateRoleDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const { data: permsData, isLoading: permsLoading } = useQuery({
    queryKey: ["permissions"],
    queryFn: () => PermissionsService.list(),
    enabled: open,
  })

  const { data: resourceNames } = useQuery({
    queryKey: ["permissions", "resource-names"],
    queryFn: () => PermissionsService.getResourceNames(),
    enabled: open,
  })

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

  const createMutation = useMutation({
    mutationFn: () =>
      RolesService.create({
        name: name.trim(),
        description: description.trim() || undefined,
        permission_ids: Array.from(selectedIds),
      }),
    onSuccess: (created) => {
      showSuccessToast("Role created successfully")
      queryClient.invalidateQueries({ queryKey: ["roles"] })
      setOpen(false)
      setName("")
      setDescription("")
      setSelectedIds(new Set())
      navigate({ to: "/admin/roles/$id/edit", params: { id: created.id } })
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

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setName("")
      setDescription("")
      setSelectedIds(new Set())
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Role
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create custom role</DialogTitle>
          <DialogDescription>
            Set name, description, and permissions. Format: <code className="text-xs">resource_type:name:action</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="create-role-name">Name</Label>
            <Input
              id="create-role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Custom Viewer"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-role-desc">Description</Label>
            <Textarea
              id="create-role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={2}
            />
          </div>
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Permissions</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select permissions by group (Datasource, Module, …). When closed, only selected
                permissions are shown.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {permsLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                permissionRowsByType.map(([typeKey, typeLabel, rows]) => {
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
                })
              )}
            </CardContent>
          </Card>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <LoadingButton
            onClick={() => createMutation.mutate()}
            loading={createMutation.isPending}
            disabled={!name.trim()}
          >
            Create
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
