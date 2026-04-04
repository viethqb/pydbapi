import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Play,
  Plus,
  Trash2,
} from "lucide-react"
import { useEffect, useState } from "react"
import { FileSelect } from "@/components/ReportManagement/FileSelect"
import { SheetSelect } from "@/components/ReportManagement/SheetSelect"
import { Badge } from "@/components/ui/badge"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import useCustomToast from "@/hooks/useCustomToast"
import { API_BASE, getAuthToken } from "@/lib/api-request"
import { ClientsService } from "@/services/clients"
import {
  type SheetMappingCreate,
  type GenerateReportIn,
  type ReportTemplateDetail,
  ReportModuleService,
  ReportExecutionsService,
} from "@/services/report"

export const Route = createFileRoute(
  "/_layout/report-management/templates/$tid",
)({
  component: TemplateDetailPage,
  head: () => ({
    meta: [{ title: "Template Detail - Report Management" }],
  }),
})

function TemplateDetailPage() {
  const { tid } = Route.useParams()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [copiedText, copyToClipboard] = useCopyToClipboard()

  // We need module ID. First fetch the execution or find it from the template.
  // We'll use a two-step approach: list modules to find which one owns this template,
  // or we get the template detail which includes report_module_id.
  // Strategy: fetch all modules, find the one containing this template.
  const { data: modulesData } = useQuery({
    queryKey: ["report-modules-lookup"],
    queryFn: () =>
      ReportModuleService.list({ page: 1, page_size: 100 }),
  })

  // Find the module that owns this template
  const [moduleId, setModuleId] = useState<string | null>(null)

  // Fetch template detail once we know the module ID
  const { data: template, isLoading: templateLoading } = useQuery({
    queryKey: ["report-template", moduleId, tid],
    queryFn: () => ReportModuleService.getTemplate(moduleId!, tid),
    enabled: !!moduleId,
  })

  // When we get template, extract module ID from it
  useEffect(() => {
    if (template?.report_module_id && !moduleId) {
      setModuleId(template.report_module_id)
    }
  }, [template, moduleId])

  // Try to find moduleId from modules list
  useEffect(() => {
    if (moduleId) return
    if (!modulesData?.data) return
    for (const mod of modulesData.data) {
      // Attempt to get the template directly from each module
      // This is a fallback; ideally the first module detail call reveals it
      ReportModuleService.get(mod.id).then((detail) => {
        if (detail.templates?.some((t) => t.id === tid)) {
          setModuleId(mod.id)
        }
      }).catch(() => {})
    }
  }, [modulesData, tid, moduleId])

  // Fetch all clients for template client access
  const { data: clientsData } = useQuery({
    queryKey: ["clients-all"],
    queryFn: () => ClientsService.list({ page: 1, page_size: 100 }),
  })

  // --- Mappings tab state ---
  const [showAddMapping, setShowAddMapping] = useState(false)
  const [newMapping, setNewMapping] = useState<SheetMappingCreate>({
    sheet_name: "",
    start_cell: "A1",
    sort_order: 0,
    write_mode: "rows",
    write_headers: true,
    sql_content: "",
  })

  const createMappingMutation = useMutation({
    mutationFn: () =>
      ReportModuleService.createMapping(moduleId!, tid, newMapping),
    onSuccess: () => {
      showSuccessToast("Mapping created successfully")
      queryClient.invalidateQueries({
        queryKey: ["report-template", moduleId, tid],
      })
      setShowAddMapping(false)
      setNewMapping({
        sheet_name: "",
        start_cell: "A1",
        sort_order: 0,
        write_mode: "rows",
        write_headers: true,
        sql_content: "",
      })
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  const deleteMappingMutation = useMutation({
    mutationFn: (mappingId: string) =>
      ReportModuleService.deleteMapping(moduleId!, tid, mappingId),
    onSuccess: () => {
      showSuccessToast("Mapping deleted")
      queryClient.invalidateQueries({
        queryKey: ["report-template", moduleId, tid],
      })
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  // --- Clients tab ---
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [clientsDirty, setClientsDirty] = useState(false)

  useEffect(() => {
    if (template?.client_ids) {
      setSelectedClientIds(template.client_ids)
    }
  }, [template?.client_ids])

  const setClientsMutation = useMutation({
    mutationFn: () =>
      ReportModuleService.setTemplateClients(
        moduleId!,
        tid,
        selectedClientIds,
      ),
    onSuccess: () => {
      showSuccessToast("Template clients updated")
      queryClient.invalidateQueries({
        queryKey: ["report-template", moduleId, tid],
      })
      setClientsDirty(false)
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  const handleClientToggle = (clientId: string, checked: boolean) => {
    setClientsDirty(true)
    if (checked) {
      setSelectedClientIds((prev) => [...prev, clientId])
    } else {
      setSelectedClientIds((prev) => prev.filter((cid) => cid !== clientId))
    }
  }

  // --- Generate tab ---
  const [genParams, setGenParams] = useState("{}")
  const [genResult, setGenResult] = useState<{
    execution_id: string
    output_url: string | null
  } | null>(null)

  const generateMutation = useMutation({
    mutationFn: () => {
      let parameters: Record<string, unknown> = {}
      try {
        parameters = JSON.parse(genParams)
      } catch {
        // empty
      }
      const body: GenerateReportIn = {
        parameters,
      }
      return ReportModuleService.generate(moduleId!, tid, body)
    },
    onSuccess: (result) => {
      showSuccessToast("Report generation started")
      setGenResult(result)
      queryClient.invalidateQueries({
        queryKey: ["report-template-executions", moduleId, tid],
      })
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  // --- History tab ---
  const { data: executionsData } = useQuery({
    queryKey: ["report-template-executions", moduleId, tid],
    queryFn: () =>
      ReportModuleService.listTemplateExecutions(moduleId!, tid, {
        page: 1,
        page_size: 50,
      }),
    enabled: !!moduleId,
    refetchInterval: (query) => {
      const execs = query.state.data?.data
      if (execs?.some((e) => e.status === "pending" || e.status === "running")) {
        return 3000
      }
      return false
    },
  })

  // --- Loading states ---
  if (!moduleId && !modulesData) {
    return (
      <div className="text-center py-8 text-muted-foreground">Loading...</div>
    )
  }

  if (templateLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">Loading...</div>
    )
  }

  if (!template) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <p className="text-muted-foreground">Template not found</p>
        <Link to="/report-management/modules">
          <Button variant="outline">Back to Modules</Button>
        </Link>
      </div>
    )
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "default"
      case "failed":
        return "destructive"
      case "running":
        return "secondary"
      default:
        return "outline"
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        {moduleId && (
          <Link
            to="/report-management/modules/$id"
            params={{ id: moduleId }}
          >
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
        )}
        <div>
          <h1 className="text-2xl font-bold">{template.name}</h1>
          <p className="text-muted-foreground font-mono text-sm">
            {template.template_bucket}/{template.template_path}
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="mappings">Mappings</TabsTrigger>
          <TabsTrigger value="generate">Generate</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <OverviewTab moduleId={moduleId!} template={template} />
        </TabsContent>

        {/* Mappings Tab */}
        <TabsContent value="mappings">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Sheet Mappings</CardTitle>
              <Button size="sm" onClick={() => setShowAddMapping(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Mapping
              </Button>
            </CardHeader>
            <CardContent>
              {template.sheet_mappings && template.sheet_mappings.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sheet</TableHead>
                      <TableHead>Start Cell</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Headers</TableHead>
                      <TableHead>SQL</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {template.sheet_mappings.map((mapping) => (
                      <TableRow key={mapping.id}>
                        <TableCell className="font-medium">
                          {mapping.sheet_name}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {mapping.start_cell}
                        </TableCell>
                        <TableCell>{mapping.sort_order}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{mapping.write_mode}</Badge>
                        </TableCell>
                        <TableCell>
                          {mapping.write_headers ? "Yes" : "No"}
                        </TableCell>
                        <TableCell>
                          <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/50 rounded p-2 max-h-[120px] overflow-y-auto">{mapping.sql_content}</pre>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              deleteMappingMutation.mutate(mapping.id)
                            }
                            disabled={deleteMappingMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No sheet mappings yet. Add one to define data placement.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add Mapping Dialog */}
          <Dialog open={showAddMapping} onOpenChange={setShowAddMapping}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Sheet Mapping</DialogTitle>
                <DialogDescription>
                  Define how data maps to the Excel template sheet.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Sheet Name *</Label>
                  <Input
                    value={newMapping.sheet_name}
                    onChange={(e) =>
                      setNewMapping({
                        ...newMapping,
                        sheet_name: e.target.value,
                      })
                    }
                    placeholder="e.g. Sheet1"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Start Cell *</Label>
                  <Input
                    value={newMapping.start_cell}
                    onChange={(e) =>
                      setNewMapping({
                        ...newMapping,
                        start_cell: e.target.value,
                      })
                    }
                    placeholder="e.g. A1"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={newMapping.sort_order ?? 0}
                    onChange={(e) =>
                      setNewMapping({
                        ...newMapping,
                        sort_order: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Write Mode</Label>
                  <Select
                    value={newMapping.write_mode || "replace"}
                    onValueChange={(v) =>
                      setNewMapping({
                        ...newMapping,
                        write_mode: v as "rows" | "single",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rows">Rows</SelectItem>
                      <SelectItem value="single">Single Value</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={newMapping.write_headers}
                    onCheckedChange={(checked) =>
                      setNewMapping({
                        ...newMapping,
                        write_headers: checked === true,
                      })
                    }
                  />
                  <Label>Write Headers</Label>
                </div>
                <div className="space-y-2">
                  <Label>SQL Content *</Label>
                  <Textarea
                    value={newMapping.sql_content}
                    onChange={(e) =>
                      setNewMapping({
                        ...newMapping,
                        sql_content: e.target.value,
                      })
                    }
                    placeholder="SELECT * FROM ..."
                    rows={5}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowAddMapping(false)}
                >
                  Cancel
                </Button>
                <LoadingButton
                  loading={createMappingMutation.isPending}
                  onClick={() => createMappingMutation.mutate()}
                  disabled={
                    !newMapping.sheet_name ||
                    !newMapping.start_cell ||
                    !newMapping.sql_content
                  }
                >
                  Add Mapping
                </LoadingButton>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Generate Tab */}
        <TabsContent value="generate">
          <Card>
            <CardHeader>
              <CardTitle>Generate Report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Parameters (JSON)</Label>
                <Textarea
                  value={genParams}
                  onChange={(e) => setGenParams(e.target.value)}
                  placeholder='{"key": "value"}'
                  rows={5}
                  className="font-mono text-sm"
                />
              </div>
              <LoadingButton
                loading={generateMutation.isPending}
                onClick={() => generateMutation.mutate()}
              >
                <Play className="mr-2 h-4 w-4" />
                Generate
              </LoadingButton>

              {genResult && (
                <div className="mt-4 p-4 rounded-md border bg-muted/30 space-y-2">
                  <p className="text-sm font-medium">Generation Result</p>
                  <p className="text-sm">
                    Execution ID:{" "}
                    <span className="font-mono">{genResult.execution_id}</span>
                  </p>
                  {genResult.status === "success" && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={async () => {
                          const t = await getAuthToken()
                          const resp = await fetch(
                            `${API_BASE}/api/v1/report-executions/${genResult.execution_id}/download`,
                            { headers: t ? { Authorization: `Bearer ${t}` } : {} },
                          )
                          if (!resp.ok) return
                          const blob = await resp.blob()
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement("a")
                          a.href = url
                          a.download = genResult.output_minio_path?.split("/").pop() || "report.xlsx"
                          a.click()
                          URL.revokeObjectURL(url)
                        }}
                      >
                        <Download className="h-4 w-4" />
                        Download Report
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          copyToClipboard(
                            `${API_BASE}/api/v1/report-executions/${genResult.execution_id}/download`,
                          )
                        }
                      >
                        {copiedText ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Execution History</CardTitle>
            </CardHeader>
            <CardContent>
              {executionsData?.data && executionsData.data.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Download</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {executionsData.data.map((exec) => (
                      <TableRow key={exec.id}>
                        <TableCell>
                          <Badge variant={statusColor(exec.status)}>
                            {exec.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {exec.started_at
                            ? new Date(exec.started_at).toLocaleString()
                            : "--"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {exec.completed_at
                            ? new Date(exec.completed_at).toLocaleString()
                            : "--"}
                        </TableCell>
                        <TableCell>
                          {exec.status === "success" && exec.output_minio_path ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={async () => {
                                const t = await getAuthToken()
                                const resp = await fetch(
                                  `${API_BASE}/api/v1/report-executions/${exec.id}/download`,
                                  { headers: t ? { Authorization: `Bearer ${t}` } : {} },
                                )
                                if (!resp.ok) return
                                const blob = await resp.blob()
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement("a")
                                a.href = url
                                a.download = exec.output_minio_path?.split("/").pop() || "report.xlsx"
                                a.click()
                                URL.revokeObjectURL(url)
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              --
                            </span>
                          )}
                        </TableCell>
                        <TableCell
                          className="text-sm text-destructive max-w-[200px] truncate"
                          title={exec.error_message || ""}
                        >
                          {exec.error_message || "--"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No executions yet.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview Tab — editable template config
// ---------------------------------------------------------------------------

function OverviewTab({
  moduleId,
  template,
}: {
  moduleId: string
  template: ReportTemplateDetail
}) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const { data: moduleDetail } = useQuery({
    queryKey: ["report-module-for-bucket", moduleId],
    queryFn: () => ReportModuleService.get(moduleId),
  })
  const minioDsId = moduleDetail?.minio_datasource_id

  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState({
    name: template.name,
    description: template.description || "",
    template_bucket: template.template_bucket,
    template_path: template.template_path,
    output_bucket: template.output_bucket,
    output_prefix: template.output_prefix,
    recalc_enabled: template.recalc_enabled,
    output_sheet: template.output_sheet || "",
  })

  useEffect(() => {
    setForm({
      name: template.name,
      description: template.description || "",
      template_bucket: template.template_bucket,
      template_path: template.template_path,
      output_bucket: template.output_bucket,
      output_prefix: template.output_prefix,
      recalc_enabled: template.recalc_enabled,
      output_sheet: template.output_sheet || "",
    })
  }, [template])

  const updateMutation = useMutation({
    mutationFn: () =>
      ReportModuleService.updateTemplate(moduleId, {
        id: template.id,
        name: form.name,
        description: form.description || null,
        template_bucket: form.template_bucket,
        template_path: form.template_path,
        output_bucket: form.output_bucket,
        output_prefix: form.output_prefix,
        recalc_enabled: form.recalc_enabled,
        output_sheet: form.output_sheet || null,
      }),
    onSuccess: () => {
      showSuccessToast("Template updated")
      queryClient.invalidateQueries({ queryKey: ["report-template-detail"] })
      setEditMode(false)
    },
    onError: (e: Error) => showErrorToast(e.message),
  })

  if (!editMode) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Template Configuration</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
            Edit
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableHead className="w-[180px]">Name</TableHead>
                <TableCell>{template.name}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableCell>{template.description || <span className="text-muted-foreground">--</span>}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Template File</TableHead>
                <TableCell className="font-mono text-sm">
                  {template.template_path || <Badge variant="outline">Blank</Badge>}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Output Prefix</TableHead>
                <TableCell className="font-mono text-sm">
                  {template.output_prefix || <span className="text-muted-foreground">--</span>}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Output Sheet</TableHead>
                <TableCell>{template.output_sheet || <span className="text-muted-foreground">Full file</span>}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Recalc</TableHead>
                <TableCell>{template.recalc_enabled ? "Enabled" : "Disabled"}</TableCell>
              </TableRow>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableCell>{new Date(template.created_at).toLocaleString()}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Edit Template</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>
            Cancel
          </Button>
          <LoadingButton
            size="sm"
            loading={updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
          >
            Save
          </LoadingButton>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            <TableRow>
              <TableHead className="w-[200px]">Name</TableHead>
              <TableCell>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableCell>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableHead>Template File</TableHead>
              <TableCell>
                <FileSelect datasourceId={minioDsId} bucket={moduleDetail?.default_template_bucket} value={form.template_path} onChange={(v) => setForm({ ...form, template_path: v })} placeholder="Select .xlsx file (empty = blank)" />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableHead>Output Prefix</TableHead>
              <TableCell>
                <Input value={form.output_prefix} onChange={(e) => setForm({ ...form, output_prefix: e.target.value })} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableHead>Output Sheet</TableHead>
              <TableCell>
                <SheetSelect datasourceId={minioDsId} bucket={moduleDetail?.default_template_bucket} filePath={form.template_path || undefined} value={form.output_sheet} onChange={(v) => setForm({ ...form, output_sheet: v, ...(v ? { recalc_enabled: true } : {}) })} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableHead>Recalc</TableHead>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={form.recalc_enabled}
                    onCheckedChange={(c) => setForm({ ...form, recalc_enabled: !!c })}
                    disabled={!!form.output_sheet}
                  />
                  <span className="text-sm">
                    LibreOffice Recalc
                    {form.output_sheet && <span className="text-muted-foreground ml-1">(required for Output Sheet)</span>}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
