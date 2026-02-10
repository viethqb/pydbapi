import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Pencil, Trash2, Key, Copy, Check, ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ClientsService } from "@/services/clients"
import { GroupsService } from "@/services/groups"
import { ApiAssignmentsService } from "@/services/api-assignments"
import { ModulesService } from "@/services/modules"
import { cn } from "@/lib/utils"
import useCustomToast from "@/hooks/useCustomToast"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { usePermissions } from "@/hooks/usePermissions"

import type { ApiAssignmentPublic } from "@/services/api-assignments"

type ApiWithMeta = ApiAssignmentPublic & {
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

export const Route = createFileRoute("/_layout/system/clients/$id")({
  component: ClientDetailPage,
  head: () => ({
    meta: [
      {
        title: "Client Detail - System",
      },
    ],
  }),
})

function ClientDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { hasPermission } = usePermissions()
  const canUpdate = hasPermission("client", "update")
  const canDelete = hasPermission("client", "delete")
  const [copiedText, copyToClipboard] = useCopyToClipboard()

  // Check if we're on the edit route
  const isEditRoute = matchRoute({ to: "/system/clients/$id/edit" })

  // ALL hooks must be called unconditionally (React Rules of Hooks)
  const { data: client, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: () => ClientsService.get(id),
  })

  // Fetch groups list (for badge display in detail view)
  const { data: groupsData } = useQuery({
    queryKey: ["groups-simple"],
    queryFn: () => GroupsService.list({ page: 1, page_size: 100 }),
    enabled: !isEditRoute,
  })

  // Fetch effective APIs — single bulk request instead of per-API fetch
  const effectiveApiIds = client?.effective_api_assignment_ids ?? []
  const { data: apis, isLoading: apisLoading } = useQuery({
    queryKey: ["client-effective-apis", id, effectiveApiIds],
    queryFn: async (): Promise<ApiWithMeta[]> => {
      if (!effectiveApiIds.length) return []

      // Bulk fetch via list endpoint with ids filter (1 request instead of N)
      const [apisResult, modules] = await Promise.all([
        ApiAssignmentsService.list({
          ids: effectiveApiIds,
          page: 1,
          page_size: effectiveApiIds.length,
        }),
        ModulesService.listSimple(),
      ])

      const moduleMap = new Map(modules.map((m) => [m.id, m]))
      return apisResult.data.map((api) => {
        const mod = moduleMap.get(api.module_id) ?? null
        return {
          ...api,
          moduleName: mod?.name ?? "-",
          fullPath: buildApiPath(mod, api),
        }
      })
    },
    enabled: !isEditRoute && effectiveApiIds.length > 0,
  })

  const [apisExpanded, setApisExpanded] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const deleteMutation = useMutation({
    mutationFn: (clientId: string) => ClientsService.delete(clientId),
    onSuccess: () => {
      showSuccessToast("Client deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["clients"] })
      navigate({ to: "/system/clients" })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
      setDeleteId(null)
    },
  })

  const [regeneratedSecret, setRegeneratedSecret] = useState<{
    clientId: string
    secret: string
  } | null>(null)
  const regenerateSecretMutation = useMutation({
    mutationFn: (clientId: string) => ClientsService.regenerateSecret(clientId),
    onSuccess: (result, clientId) => {
      setRegeneratedSecret({
        clientId,
        secret: result.client_secret,
      })
      showSuccessToast("Client secret regenerated successfully")
      queryClient.invalidateQueries({ queryKey: ["client", clientId] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  // --- Early return AFTER all hooks ---

  // If on edit route, only render Outlet (edit page) — same pattern as modules/$id.tsx
  if (isEditRoute) {
    return <Outlet />
  }

  const handleDelete = () => {
    setDeleteId(id)
  }

  const handleRegenerateSecret = () => {
    regenerateSecretMutation.mutate(id)
  }

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId)
    }
  }

  const handleCopySecret = async () => {
    if (regeneratedSecret) {
      const success = await copyToClipboard(regeneratedSecret.secret)
      if (success) {
        showSuccessToast("Secret copied to clipboard")
      }
    }
  }

  const assignedGroups = client?.group_ids && groupsData?.data
    ? groupsData.data.filter((g) => client.group_ids.includes(g.id))
    : []

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">Loading...</div>
    )
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <p className="text-muted-foreground">Client not found</p>
        <Link to="/system/clients">
          <Button variant="outline">Back to Clients</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/system/clients">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{client.name}</h1>
            <p className="text-muted-foreground">
              {client.description || "Client detail and access information"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {canUpdate && (
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/system/clients/$id/edit", params: { id } })}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
          <Button variant="outline" onClick={handleRegenerateSecret} disabled={regenerateSecretMutation.isPending}>
            <Key className="mr-2 h-4 w-4" />
            Regenerate Secret
          </Button>
          {canDelete && (
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Client Information */}
      <Card>
        <CardHeader>
          <CardTitle>Client Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableBody>
              <TableRow>
                <TableHead className="w-[180px]">Name</TableHead>
                <TableCell className="font-medium">{client.name}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead className="w-[180px]">Client ID</TableHead>
                <TableCell>
                  <span className="font-mono text-sm">{client.client_id}</span>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableHead className="w-[180px]">Status</TableHead>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex size-2 rounded-full",
                        client.is_active ? "bg-green-500" : "bg-gray-400",
                      )}
                    />
                    <span>{client.is_active ? "Active" : "Inactive"}</span>
                  </span>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableHead className="w-[180px]">Rate Limit</TableHead>
                <TableCell>
                  {client.rate_limit_per_minute
                    ? `${client.rate_limit_per_minute} req/min`
                    : "No limit"}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableHead className="w-[180px]">Max Concurrent</TableHead>
                <TableCell>
                  {client.max_concurrent
                    ? `${client.max_concurrent} requests`
                    : "Use global default"}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableHead className="w-[180px]">Created</TableHead>
                <TableCell className="text-sm">
                  {new Date(client.created_at).toLocaleString()}
                </TableCell>
              </TableRow>
              {client.description && (
                <TableRow>
                  <TableHead className="w-[180px]">Description</TableHead>
                  <TableCell>{client.description}</TableCell>
                </TableRow>
              )}
              {assignedGroups.length > 0 && (
                <TableRow>
                  <TableHead className="w-[180px]">API Groups</TableHead>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {assignedGroups.map((group) => (
                        <Link
                          key={group.id}
                          to="/system/groups/$id"
                          params={{ id: group.id }}
                        >
                          <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                            {group.name}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableHead className="w-[180px]">APIs Accessible</TableHead>
                <TableCell>
                  {apisLoading ? (
                    <span className="text-sm text-muted-foreground">Loading APIs...</span>
                  ) : !apis?.length ? (
                    <span className="text-sm text-muted-foreground">
                      No APIs accessible by this client
                    </span>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {apis.length} API{apis.length !== 1 ? "s" : ""} accessible
                        {(() => {
                          const parts: string[] = []
                          if (client.group_ids?.length) {
                            parts.push(`${client.group_ids.length} group${client.group_ids.length !== 1 ? "s" : ""}`)
                          }
                          if (client.api_assignment_ids?.length) {
                            parts.push(`${client.api_assignment_ids.length} direct`)
                          }
                          return parts.length ? ` (via ${parts.join(" + ")})` : ""
                        })()}
                      </p>
                      {(() => {
                        const API_PREVIEW_LIMIT = 5
                        const visibleApis = apisExpanded ? apis : apis.slice(0, API_PREVIEW_LIMIT)
                        const hasMore = apis.length > API_PREVIEW_LIMIT
                        return (
                          <>
                            <div className="space-y-1">
                              {visibleApis.map((api) => (
                                <div key={api.id} className="text-sm flex items-center gap-2">
                                  <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted border">
                                    [{api.http_method}]
                                  </span>
                                  <Link
                                    to="/api-dev/apis/$id"
                                    params={{ id: api.id }}
                                    className="font-mono text-xs text-primary hover:underline"
                                  >
                                    {api.fullPath || api.path}
                                  </Link>
                                </div>
                              ))}
                            </div>
                            {hasMore && (
                              <button
                                type="button"
                                onClick={() => setApisExpanded((prev) => !prev)}
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                              >
                                {apisExpanded ? (
                                  <>
                                    <ChevronUp className="h-3 w-3" />
                                    Show less
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="h-3 w-3" />
                                    Show all {apis.length} APIs
                                  </>
                                )}
                              </button>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Regenerate Secret Dialog */}
      <Dialog
        open={regeneratedSecret !== null}
        onOpenChange={() => setRegeneratedSecret(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Client Secret Regenerated</DialogTitle>
            <DialogDescription>
              Save this secret now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2">
              <Input
                value={regeneratedSecret?.secret || ""}
                readOnly
                className="font-mono"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopySecret}
              >
                {copiedText === regeneratedSecret?.secret ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setRegeneratedSecret(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Client</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this client? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteId(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
