import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useCustomToast from "@/hooks/useCustomToast"
import { PERMISSION_MATRIX } from "@/components/Admin/permissionMatrix"
import {
  type ResourcePermissionItem,
  type RolePublic,
  PermissionsService,
  RolesService,
} from "@/services/roles"
import { handleError } from "@/utils"

const RESOURCE_TYPE_TABS: { value: string; label: string }[] = [
  { value: "connection", label: "Per connection" },
  { value: "api_assignment", label: "Per API" },
  { value: "module", label: "Per module" },
  { value: "macro_def", label: "Per macro def" },
  { value: "group", label: "Per group" },
  { value: "client", label: "Per client" },
]

function ResourcePermissionsTable({
  roleId,
  resourceType,
  onSuccess,
}: {
  roleId: string
  resourceType: string
  onSuccess: () => void
}) {
  const [items, setItems] = useState<ResourcePermissionItem[]>([])
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { data, isLoading } = useQuery({
    queryKey: ["roleResourcePermissions", roleId, resourceType],
    queryFn: () => RolesService.getResourcePermissions(roleId, resourceType),
    enabled: Boolean(roleId && resourceType),
  })

  useEffect(() => {
    if (data?.items) setItems(data.items)
  }, [data?.items])

  const setMutation = useMutation({
    mutationFn: (perms: ResourcePermissionItem[]) =>
      RolesService.setResourcePermissions(roleId, {
        resource_type: resourceType,
        permissions: perms,
      }),
    onSuccess: () => {
      showSuccessToast("Saved")
      onSuccess()
    },
    onError: handleError.bind(showErrorToast),
  })

  const toggle = (index: number, field: "can_view" | "can_edit" | "can_delete", value: boolean) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, [field]: value } : it
      )
    )
  }

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading…</p>
  if (!items.length) return <p className="text-muted-foreground text-sm">No resources of this type.</p>

  return (
    <div className="space-y-2">
      <div className="max-h-[70vh] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Name</TableHead>
              <TableHead className="w-24 text-center">Can view</TableHead>
              <TableHead className="w-24 text-center">Can edit</TableHead>
              <TableHead className="w-24 text-center">Can delete</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it, idx) => (
              <TableRow key={it.resource_id}>
                <TableCell className="font-medium">{it.resource_name ?? it.resource_id}</TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={it.can_view}
                    onCheckedChange={(c) => toggle(idx, "can_view", c === true)}
                    aria-label={`${it.resource_name} view`}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={it.can_edit}
                    onCheckedChange={(c) => toggle(idx, "can_edit", c === true)}
                    aria-label={`${it.resource_name} edit`}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={it.can_delete}
                    onCheckedChange={(c) => toggle(idx, "can_delete", c === true)}
                    aria-label={`${it.resource_name} delete`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <LoadingButton
        loading={setMutation.isPending}
        onClick={() => setMutation.mutate(items)}
      >
        Save {resourceType}
      </LoadingButton>
    </div>
  )
}

interface EditRolePermissionsProps {
  role: RolePublic
  onSuccess: () => void
}

export function EditRolePermissions({ role, onSuccess }: EditRolePermissionsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const { data: permissionsData } = useQuery({
    queryKey: ["permissions"],
    queryFn: () => PermissionsService.list(),
    enabled: isOpen,
  })

  const { data: roleDetail } = useQuery({
    queryKey: ["role", role.id],
    queryFn: () => RolesService.get(role.id),
    enabled: isOpen,
  })

  useEffect(() => {
    if (roleDetail?.permission_codes != null && permissionsData?.data != null) {
      const codes = new Set(roleDetail.permission_codes)
      const ids = permissionsData.data
        .filter((p) => codes.has(p.code))
        .map((p) => p.id)
      setSelectedIds(ids)
    }
  }, [roleDetail?.permission_codes, permissionsData?.data])

  const setPermissionsMutation = useMutation({
    mutationFn: (permissionIds: string[]) =>
      RolesService.setPermissions(role.id, permissionIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] })
      queryClient.invalidateQueries({ queryKey: ["role", role.id] })
      showSuccessToast("Permissions updated")
      setIsOpen(false)
      onSuccess()
    },
    onError: handleError.bind(showErrorToast),
  })

  const togglePermission = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id)
    )
  }

  const handleSubmit = () => {
    setPermissionsMutation.mutate(selectedIds)
  }

  const permissions = permissionsData?.data ?? []
  const codeToId = Object.fromEntries(permissions.map((p) => [p.code, p.id]))

  return (
    <>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault()
          setIsOpen(true)
        }}
      >
        <Pencil className="mr-2 size-4" />
        Edit permissions
      </DropdownMenuItem>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col overflow-hidden sm:max-w-2xl md:max-w-4xl lg:max-w-5xl"
        >
          <SheetHeader>
            <SheetTitle>Permissions: {role.name}</SheetTitle>
            <SheetDescription className="space-y-1">
              {roleDetail?.is_system
                ? "System role. You can still change which permissions it has."
                : "Set permissions per resource."}
              <span className="block rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                <strong>Can access</strong> = show this item in the sidebar menu and allow entering the page. Without access, view/edit/delete for that section have no effect.
              </span>
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-auto py-2">
          <Tabs defaultValue="global" className="w-full">
            <TabsList className="mb-2 flex flex-wrap gap-1">
              <TabsTrigger value="global">Menu &amp; global</TabsTrigger>
              {RESOURCE_TYPE_TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="global" className="mt-2">
          <div className="py-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Resource</TableHead>
                  <TableHead className="w-28 text-center whitespace-nowrap">Can access (menu)</TableHead>
                  <TableHead className="w-28 text-center whitespace-nowrap">Can view</TableHead>
                  <TableHead className="w-28 text-center whitespace-nowrap">Can edit</TableHead>
                  <TableHead className="w-28 text-center whitespace-nowrap">Can delete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PERMISSION_MATRIX.map((row, idx) => {
                  const accessId = row.access ? codeToId[row.access] : undefined
                  const viewId = row.view ? codeToId[row.view] : undefined
                  const editId = row.edit ? codeToId[row.edit] : undefined
                  const deleteId = row.delete ? codeToId[row.delete] : undefined
                  const hasAny = accessId || viewId || editId || deleteId
                  if (!hasAny) return null
                  return (
                    <TableRow key={`${row.resource}-${row.label}-${idx}`}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="text-center">
                        {accessId != null ? (
                          <Checkbox
                            checked={selectedIds.includes(accessId)}
                            onCheckedChange={(c) =>
                              togglePermission(accessId, c === true)
                            }
                            aria-label={`${row.label} access`}
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {viewId != null ? (
                          <Checkbox
                            checked={selectedIds.includes(viewId)}
                            onCheckedChange={(c) =>
                              togglePermission(viewId, c === true)
                            }
                            aria-label={`${row.label} view`}
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {editId != null ? (
                          <Checkbox
                            checked={selectedIds.includes(editId)}
                            onCheckedChange={(c) =>
                              togglePermission(editId, c === true)
                            }
                            aria-label={`${row.label} edit`}
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {deleteId != null ? (
                          <Checkbox
                            checked={selectedIds.includes(deleteId)}
                            onCheckedChange={(c) =>
                              togglePermission(deleteId, c === true)
                            }
                            aria-label={`${row.label} delete`}
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
            </TabsContent>
            {RESOURCE_TYPE_TABS.map((t) => (
              <TabsContent key={t.value} value={t.value} className="mt-2">
                <ResourcePermissionsTable
                  roleId={role.id}
                  resourceType={t.value}
                  onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ["role", role.id] })
                  }}
                />
              </TabsContent>
            ))}
          </Tabs>
          </div>
          <SheetFooter className="border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <LoadingButton
              loading={setPermissionsMutation.isPending}
              onClick={handleSubmit}
            >
              Save global
            </LoadingButton>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
