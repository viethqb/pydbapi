import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"

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
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingButton } from "@/components/ui/loading-button"
import { Textarea } from "@/components/ui/textarea"
import { PermissionsService } from "@/services/permissions"
import { RolesService } from "@/services/roles"
import useCustomToast from "@/hooks/useCustomToast"

function groupByResourceAndScope(
  perms: {
    id: string
    resource_type: string
    action: string
    resource_id: string | null
  }[],
): Map<string, { id: string; action: string }[]> {
  const map = new Map<string, { id: string; action: string }[]>()
  for (const p of perms) {
    const scope = p.resource_id == null ? "all" : p.resource_id
    const key = `${p.resource_type}:${scope}`
    const list = map.get(key) ?? []
    list.push({ id: p.id, action: p.action })
    map.set(key, list)
  }
  return map
}

export default function CreateRoleDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>("")
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

  const permissionGroups = useMemo(() => {
    if (!permsData?.data) return new Map<string, { id: string; action: string }[]>()
    return groupByResourceAndScope(permsData.data)
  }, [permsData])

  const moduleNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of resourceNames?.modules ?? []) {
      map.set(String(m.id).toLowerCase(), m.name)
    }
    return map
  }, [resourceNames])

  const datasourceNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const ds of resourceNames?.datasources ?? []) {
      map.set(String(ds.id).toLowerCase(), ds.name)
    }
    return map
  }, [resourceNames])

  const filteredPermissionEntries = useMemo(() => {
    let entries = Array.from(permissionGroups.entries())
    if (resourceTypeFilter) {
      entries = entries.filter(([groupKey]) => {
        const [resourceType] = groupKey.split(":", 2)
        return resourceType === resourceTypeFilter
      })
    }
    return entries.sort(([a], [b]) => a.localeCompare(b))
  }, [permissionGroups, resourceTypeFilter])

  const permissionsByType = useMemo(() => {
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
    const typeLabel: Record<string, string> = {
      datasource: "Datasource",
      module: "Module",
      group: "Group",
      api_assignment: "API Assignment",
      macro_def: "Macro definition",
      client: "Client",
      user: "User",
      overview: "Overview",
    }
    const byType = new Map<string, [string, { id: string; action: string }[]][]>()
    for (const entry of filteredPermissionEntries) {
      const [resourceType] = entry[0].split(":", 2)
      const list = byType.get(resourceType) ?? []
      list.push(entry)
      byType.set(resourceType, list)
    }
    return order
      .filter((t) => byType.has(t))
      .map(
        (t) => [t, typeLabel[t] ?? t, byType.get(t) ?? []] as const,
      )
  }, [filteredPermissionEntries])

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
      navigate({ to: "/admin/roles/$id", params: { id: created.id } })
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

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setName("")
      setDescription("")
      setSelectedIds(new Set())
      setResourceTypeFilter("")
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
            Set name, description, and permissions. Scope: All = entire resource type; ID = specific resource.
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
              <div className="pt-2">
                <Label className="text-xs text-muted-foreground">
                  Resource type:
                </Label>
                <Select
                  value={resourceTypeFilter || "all"}
                  onValueChange={(v) =>
                    setResourceTypeFilter(v === "all" ? "" : v)
                  }
                >
                  <SelectTrigger className="mt-1 h-8 w-[180px]">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="datasource">Datasource</SelectItem>
                    <SelectItem value="module">Module</SelectItem>
                    <SelectItem value="group">Group</SelectItem>
                    <SelectItem value="api_assignment">API Assignment</SelectItem>
                    <SelectItem value="macro_def">Macro definition</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="overview">Overview</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="max-h-[280px] overflow-y-auto">
              {permsLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <div className="space-y-4">
                  {permissionsByType.map(([typeKey, typeLabel, entries]) => (
                    <div key={typeKey}>
                      <h4 className="text-xs font-semibold mb-2">
                        {typeLabel}
                      </h4>
                      <div className="border-t pt-2">
                        <div className="grid gap-3 sm:grid-cols-2">
                          {entries.map(([groupKey, perms]) => {
                            const [resourceType, scopePart] =
                              groupKey.split(":", 2)
                            const scope =
                              scopePart === "all"
                                ? "All"
                                : resourceType === "module"
                                  ? moduleNameById.get(
                                        String(scopePart).toLowerCase(),
                                      ) ?? `ID: ${String(scopePart).slice(0, 8)}…`
                                  : resourceType === "datasource"
                                    ? datasourceNameById.get(
                                          String(scopePart).toLowerCase(),
                                        ) ?? `ID: ${String(scopePart).slice(0, 8)}…`
                                    : `ID: ${scopePart.slice(0, 8)}…`
                            const label = `${resourceType.replace(/_/g, " ")} · ${scope}`
                            return (
                              <div
                                key={groupKey}
                                className="rounded border p-2 space-y-1"
                              >
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    id={`cr-${groupKey}`}
                                    checked={perms.every((p) =>
                                      selectedIds.has(p.id),
                                    )}
                                    onCheckedChange={(v) =>
                                      toggleAllForGroup(groupKey, v === true)
                                    }
                                  />
                                  <Label
                                    htmlFor={`cr-${groupKey}`}
                                    className="text-xs font-medium"
                                  >
                                    {label}
                                  </Label>
                                </div>
                                <div className="flex flex-wrap gap-2 pl-5">
                                  {perms.map((p) => (
                                    <div
                                      key={p.id}
                                      className="flex items-center gap-1"
                                    >
                                      <Checkbox
                                        id={`cr-${p.id}`}
                                        checked={selectedIds.has(p.id)}
                                        onCheckedChange={(v) =>
                                          togglePermission(p.id, v === true)
                                        }
                                      />
                                      <Label
                                        htmlFor={`cr-${p.id}`}
                                        className="text-xs text-muted-foreground"
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
                      </div>
                    </div>
                  ))}
                </div>
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
