import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createFileRoute,
  Link,
  Outlet,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router"
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { DataTable } from "@/components/Common/DataTable"
import {
  reportTemplatesColumns,
  type TemplateTableData,
} from "@/components/ReportManagement/report-templates-columns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useCustomToast from "@/hooks/useCustomToast"
import { usePermissions } from "@/hooks/usePermissions"
import { ClientsService } from "@/services/clients"
import { DataSourceService } from "@/services/datasource"
import { ReportModuleService } from "@/services/report"

export const Route = createFileRoute("/_layout/report-management/modules/$id")({
  component: ModuleDetailPage,
  head: () => ({
    meta: [{ title: "Module Detail - Report Management" }],
  }),
})

function ModuleDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { hasPermission } = usePermissions()

  const canUpdate = hasPermission("report_module", "update", id)
  const canDelete = hasPermission("report_module", "delete", id)
  const canCreateTemplate = canUpdate
  const canDeleteTemplate = canUpdate

  const isEditRoute = matchRoute({ to: "/report-management/modules/$id/edit" })

  const { data: module, isLoading } = useQuery({
    queryKey: ["report-module", id],
    queryFn: () => ReportModuleService.get(id),
  })

  const { data: dsData } = useQuery({
    queryKey: ["datasources-all"],
    queryFn: () => DataSourceService.list({ page: 1, page_size: 100 }),
    enabled: !isEditRoute,
  })

  const { data: clientsData } = useQuery({
    queryKey: ["clients-all"],
    queryFn: () => ClientsService.list({ page: 1, page_size: 100 }),
    enabled: !isEditRoute,
  })

  const [deleteModuleOpen, setDeleteModuleOpen] = useState(false)
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null)

  const deleteModuleMutation = useMutation({
    mutationFn: () => ReportModuleService.delete(id),
    onSuccess: () => {
      showSuccessToast("Module deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["report-modules"] })
      navigate({ to: "/report-management/modules" })
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: (templateId: string) =>
      ReportModuleService.deleteTemplate(id, templateId),
    onSuccess: () => {
      showSuccessToast("Template deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["report-module", id] })
      setDeleteTemplateId(null)
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
      setDeleteTemplateId(null)
    },
  })

  const toggleTemplateMutation = useMutation({
    mutationFn: (vars: { templateId: string; newStatus: boolean }) =>
      ReportModuleService.updateTemplate(id, {
        id: vars.templateId,
        is_active: vars.newStatus,
      }),
    onSuccess: () => {
      showSuccessToast("Template status updated")
      queryClient.invalidateQueries({ queryKey: ["report-module", id] })
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  // --- Clients tab ---
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [clientsDirty, setClientsDirty] = useState(false)

  useEffect(() => {
    if (module?.client_ids) {
      setSelectedClientIds(module.client_ids)
      setClientsDirty(false)
    }
  }, [module?.client_ids])

  const setClientsMutation = useMutation({
    mutationFn: () => ReportModuleService.setClients(id, selectedClientIds),
    onSuccess: () => {
      showSuccessToast("Module clients updated successfully")
      queryClient.invalidateQueries({ queryKey: ["report-module", id] })
      setClientsDirty(false)
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  const handleClientToggle = (clientId: string, checked: boolean) => {
    setClientsDirty(true)
    setSelectedClientIds((prev) =>
      checked ? [...prev, clientId] : prev.filter((cid) => cid !== clientId),
    )
  }

  const getDsName = (dsId: string) => {
    const ds = dsData?.data.find((d) => d.id === dsId)
    return ds ? ds.name : dsId
  }

  // Edit child route takes over the whole page when active.
  if (isEditRoute) {
    return <Outlet />
  }

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">Loading...</div>
    )
  }

  if (!module) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <p className="text-muted-foreground">Module not found</p>
        <Link to="/report-management/modules">
          <Button variant="outline">Back to Modules</Button>
        </Link>
      </div>
    )
  }

  const templateTableData: TemplateTableData[] = (module.templates ?? []).map(
    (tpl) => ({
      ...tpl,
      module_name: module.name,
      onDelete: setDeleteTemplateId,
      onToggleStatus: (templateId: string, currentStatus: boolean) =>
        toggleTemplateMutation.mutate({
          templateId,
          newStatus: !currentStatus,
        }),
      canUpdate: hasPermission("report_module", "update", id),
      canDelete: canDeleteTemplate,
      canExecute: hasPermission("report_module", "execute", id),
    }),
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/report-management/modules">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {module.name}
              </h1>
              <Badge variant={module.is_active ? "default" : "secondary"}>
                {module.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              {module.description || "No description"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canCreateTemplate && (
            <Link
              to="/report-management/templates/create"
              search={{ module_id: id }}
            >
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Template
              </Button>
            </Link>
          )}
          {canUpdate && (
            <Link to="/report-management/modules/$id/edit" params={{ id }}>
              <Button variant="outline">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </Link>
          )}
          {canDelete && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteModuleOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="templates">
            Templates ({module.templates?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="clients">
            Clients ({module.client_ids?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab — read-only summary */}
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Module Information</CardTitle>
              <CardDescription>
                Datasources and default MinIO buckets used by all templates in
                this module.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableHead className="w-[220px]">
                      MinIO Datasource
                    </TableHead>
                    <TableCell>
                      {getDsName(module.minio_datasource_id)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[220px]">SQL Datasource</TableHead>
                    <TableCell>{getDsName(module.sql_datasource_id)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[220px]">
                      Default Template Bucket
                    </TableHead>
                    <TableCell className="font-mono text-sm">
                      {module.default_template_bucket || (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[220px]">
                      Default Output Bucket
                    </TableHead>
                    <TableCell className="font-mono text-sm">
                      {module.default_output_bucket || (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[220px]">Created</TableHead>
                    <TableCell className="text-muted-foreground">
                      {new Date(module.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[220px]">Updated</TableHead>
                    <TableCell className="text-muted-foreground">
                      {new Date(module.updated_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab — DataTable */}
        <TabsContent value="templates">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Templates in this module</CardTitle>
                <CardDescription>
                  Report templates defined under this module.
                </CardDescription>
              </div>
              {canCreateTemplate && (
                <Link
                  to="/report-management/templates/create"
                  search={{ module_id: id }}
                >
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Template
                  </Button>
                </Link>
              )}
            </CardHeader>
            <CardContent>
              {templateTableData.length > 0 ? (
                <DataTable
                  columns={reportTemplatesColumns}
                  data={templateTableData}
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No templates yet.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Clients Tab — assign gateway client access */}
        <TabsContent value="clients">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Client Access</CardTitle>
                <CardDescription>
                  Gateway clients assigned here can generate reports under this
                  module via API.
                </CardDescription>
              </div>
              {canUpdate && clientsDirty && (
                <LoadingButton
                  loading={setClientsMutation.isPending}
                  onClick={() => setClientsMutation.mutate()}
                  size="sm"
                >
                  Save
                </LoadingButton>
              )}
            </CardHeader>
            <CardContent>
              {clientsData?.data && clientsData.data.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {clientsData.data.map((c) => {
                    const checked = selectedClientIds.includes(c.id)
                    const checkboxId = `client-toggle-${c.id}`
                    return (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/30"
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={checked}
                          disabled={!canUpdate}
                          onCheckedChange={(v) =>
                            handleClientToggle(c.id, v === true)
                          }
                        />
                        <Label
                          htmlFor={checkboxId}
                          className="flex flex-col cursor-pointer"
                        >
                          <span className="font-medium">{c.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {c.client_id}
                          </span>
                        </Label>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No clients configured yet.
                </div>
              )}
              {clientsData?.data &&
                clientsData.data.length > 0 &&
                selectedClientIds.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-3">
                    <Label className="inline">Tip:</Label> No clients selected —
                    the module is reachable only via dashboard login.
                  </p>
                )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Render child edit route if matched (fallback, usually handled above) */}
      <Outlet />

      {/* Delete Module Dialog */}
      <Dialog open={deleteModuleOpen} onOpenChange={setDeleteModuleOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              deleteModuleMutation.mutate()
            }}
          >
            <DialogHeader>
              <DialogTitle>Delete Module</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{module.name}</strong>?
                This action cannot be undone. All templates, mappings, and
                executions under this module will be permanently removed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button
                  variant="outline"
                  disabled={deleteModuleMutation.isPending}
                >
                  Cancel
                </Button>
              </DialogClose>
              <LoadingButton
                variant="destructive"
                type="submit"
                loading={deleteModuleMutation.isPending}
              >
                Delete
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Template Dialog */}
      <Dialog
        open={deleteTemplateId !== null}
        onOpenChange={(open) => !open && setDeleteTemplateId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (deleteTemplateId) {
                deleteTemplateMutation.mutate(deleteTemplateId)
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>Delete Template</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this template? All sheet
                mappings and execution history will also be removed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button
                  variant="outline"
                  disabled={deleteTemplateMutation.isPending}
                >
                  Cancel
                </Button>
              </DialogClose>
              <LoadingButton
                variant="destructive"
                type="submit"
                loading={deleteTemplateMutation.isPending}
              >
                Delete
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
