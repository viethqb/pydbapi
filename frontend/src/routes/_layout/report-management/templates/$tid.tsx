import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react"
import { useEffect, useState } from "react"
import { FileSelect } from "@/components/ReportManagement/FileSelect"
import { FormatConfigEditor } from "@/components/ReportManagement/FormatConfigEditor"
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
  type FormatConfig,
  type CellFormat,
  type SheetMappingCreate,
  type SheetMappingPublic,
  type SheetMappingUpdate,
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
    gap_rows: 0,
    format_config: null,
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
        gap_rows: 0,
        format_config: null,
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

  // --- Edit mapping state ---
  const [editMapping, setEditMapping] = useState<SheetMappingPublic | null>(null)
  const [editForm, setEditForm] = useState<SheetMappingUpdate>({ id: "" })

  const openEditMapping = (mapping: SheetMappingPublic) => {
    setEditMapping(mapping)
    setEditForm({
      id: mapping.id,
      sheet_name: mapping.sheet_name,
      start_cell: mapping.start_cell,
      sort_order: mapping.sort_order,
      write_mode: mapping.write_mode,
      write_headers: mapping.write_headers,
      gap_rows: mapping.gap_rows,
      format_config: mapping.format_config,
      sql_content: mapping.sql_content,
      description: mapping.description,
      is_active: mapping.is_active,
    })
  }

  const updateMappingMutation = useMutation({
    mutationFn: () =>
      ReportModuleService.updateMapping(moduleId!, tid, editForm),
    onSuccess: () => {
      showSuccessToast("Mapping updated successfully")
      queryClient.invalidateQueries({
        queryKey: ["report-template", moduleId, tid],
      })
      setEditMapping(null)
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
                <div className="space-y-4">
                  {template.sheet_mappings.map((mapping) => (
                    <div key={mapping.id} className={`border rounded-lg overflow-hidden ${!mapping.is_active ? "opacity-50" : ""}`}>
                      <Table>
                        <TableBody>
                          <TableRow>
                            <TableHead className="w-[140px] bg-muted/30">Sheet</TableHead>
                            <TableCell className="font-medium">{mapping.sheet_name}</TableCell>
                            <TableHead className="w-[140px] bg-muted/30">Start Cell</TableHead>
                            <TableCell className="font-mono">{mapping.start_cell}</TableCell>
                            <TableHead className="w-[140px] bg-muted/30">Mode</TableHead>
                            <TableCell><Badge variant="outline">{mapping.write_mode}</Badge></TableCell>
                            <TableCell rowSpan={3} className="w-[80px] align-top pt-3">
                              <div className="flex flex-col items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditMapping(mapping)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMappingMutation.mutate(mapping.id)} disabled={deleteMappingMutation.isPending}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableHead className="bg-muted/30">Order</TableHead>
                            <TableCell>{mapping.sort_order}</TableCell>
                            <TableHead className="bg-muted/30">Headers</TableHead>
                            <TableCell>{mapping.write_headers ? "Yes" : "No"}</TableCell>
                            <TableHead className="bg-muted/30">Gap Rows</TableHead>
                            <TableCell>{mapping.gap_rows || 0}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableHead className="bg-muted/30 align-top">SQL</TableHead>
                            <TableCell colSpan={5}>
                              <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/50 rounded p-2 max-h-[120px] overflow-y-auto">{mapping.sql_content}</pre>
                            </TableCell>
                          </TableRow>
                          {mapping.format_config && (
                            <TableRow>
                              <TableHead className="bg-muted/30 align-top">Format</TableHead>
                              <TableCell colSpan={5}>
                                <FormatSummary config={mapping.format_config} />
                              </TableCell>
                            </TableRow>
                          )}
                          {(mapping.description || !mapping.is_active) && (
                            <TableRow>
                              <TableHead className="bg-muted/30">Status</TableHead>
                              <TableCell colSpan={5}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {!mapping.is_active && <Badge variant="destructive">Inactive</Badge>}
                                  {mapping.description && <span className="text-xs text-muted-foreground">{mapping.description}</span>}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No sheet mappings yet. Add one to define data placement.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add Mapping Dialog */}
          <Dialog open={showAddMapping} onOpenChange={setShowAddMapping}>
            <DialogContent className="sm:max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Sheet Mapping</DialogTitle>
                <DialogDescription>
                  Define how data maps to the Excel template sheet.
                </DialogDescription>
              </DialogHeader>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableHead className="w-[140px] bg-muted/30">Sheet Name *</TableHead>
                    <TableCell>
                      <Input value={newMapping.sheet_name} onChange={(e) => setNewMapping({ ...newMapping, sheet_name: e.target.value })} placeholder="e.g. Sheet1" />
                    </TableCell>
                    <TableHead className="w-[140px] bg-muted/30">Start Cell *</TableHead>
                    <TableCell>
                      <Input value={newMapping.start_cell} onChange={(e) => setNewMapping({ ...newMapping, start_cell: e.target.value })} placeholder="e.g. A1" className="font-mono" />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="bg-muted/30">Write Mode</TableHead>
                    <TableCell>
                      <Select value={newMapping.write_mode || "rows"} onValueChange={(v) => setNewMapping({ ...newMapping, write_mode: v as "rows" | "single" })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rows">Rows</SelectItem>
                          <SelectItem value="single">Single Value</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableHead className="bg-muted/30">Sort Order</TableHead>
                    <TableCell>
                      <Input type="number" value={newMapping.sort_order ?? 0} onChange={(e) => setNewMapping({ ...newMapping, sort_order: Number(e.target.value) })} />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="bg-muted/30">Gap Rows</TableHead>
                    <TableCell>
                      <Input type="number" min={0} value={newMapping.gap_rows ?? 0} onChange={(e) => setNewMapping({ ...newMapping, gap_rows: Number(e.target.value) })} />
                    </TableCell>
                    <TableHead className="bg-muted/30">Options</TableHead>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Checkbox checked={newMapping.write_headers} onCheckedChange={(checked) => setNewMapping({ ...newMapping, write_headers: checked === true })} />
                        <Label>Write Headers</Label>
                      </div>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="bg-muted/30 align-top pt-3">SQL Content *</TableHead>
                    <TableCell colSpan={3}>
                      <Textarea value={newMapping.sql_content} onChange={(e) => setNewMapping({ ...newMapping, sql_content: e.target.value })} placeholder="SELECT * FROM ..." rows={6} className="font-mono text-sm" />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="bg-muted/30 align-top pt-3">Format</TableHead>
                    <TableCell colSpan={3}>
                      <FormatConfigEditor value={newMapping.format_config} onChange={(v) => setNewMapping({ ...newMapping, format_config: v })} />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddMapping(false)}>Cancel</Button>
                <LoadingButton loading={createMappingMutation.isPending} onClick={() => createMappingMutation.mutate()} disabled={!newMapping.sheet_name || !newMapping.start_cell || !newMapping.sql_content}>
                  Add Mapping
                </LoadingButton>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Mapping Dialog */}
          <Dialog open={!!editMapping} onOpenChange={(open) => { if (!open) setEditMapping(null) }}>
            <DialogContent className="sm:max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Sheet Mapping</DialogTitle>
                <DialogDescription>
                  Update the mapping configuration.
                </DialogDescription>
              </DialogHeader>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableHead className="w-[140px] bg-muted/30">Sheet Name *</TableHead>
                    <TableCell>
                      <Input value={editForm.sheet_name ?? ""} onChange={(e) => setEditForm({ ...editForm, sheet_name: e.target.value })} placeholder="e.g. Sheet1" />
                    </TableCell>
                    <TableHead className="w-[140px] bg-muted/30">Start Cell *</TableHead>
                    <TableCell>
                      <Input value={editForm.start_cell ?? ""} onChange={(e) => setEditForm({ ...editForm, start_cell: e.target.value })} placeholder="e.g. A1" className="font-mono" />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="bg-muted/30">Write Mode</TableHead>
                    <TableCell>
                      <Select value={editForm.write_mode || "rows"} onValueChange={(v) => setEditForm({ ...editForm, write_mode: v as "rows" | "single" })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rows">Rows</SelectItem>
                          <SelectItem value="single">Single Value</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableHead className="bg-muted/30">Sort Order</TableHead>
                    <TableCell>
                      <Input type="number" value={editForm.sort_order ?? 0} onChange={(e) => setEditForm({ ...editForm, sort_order: Number(e.target.value) })} />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="bg-muted/30">Gap Rows</TableHead>
                    <TableCell>
                      <Input type="number" min={0} value={editForm.gap_rows ?? 0} onChange={(e) => setEditForm({ ...editForm, gap_rows: Number(e.target.value) })} />
                    </TableCell>
                    <TableHead className="bg-muted/30">Options</TableHead>
                    <TableCell>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2">
                          <Checkbox checked={editForm.write_headers ?? false} onCheckedChange={(checked) => setEditForm({ ...editForm, write_headers: checked === true })} />
                          <span className="text-sm">Headers</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <Checkbox checked={editForm.is_active ?? true} onCheckedChange={(checked) => setEditForm({ ...editForm, is_active: checked === true })} />
                          <span className="text-sm">Active</span>
                        </label>
                      </div>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="bg-muted/30">Description</TableHead>
                    <TableCell colSpan={3}>
                      <Input value={editForm.description ?? ""} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Optional description" />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="bg-muted/30 align-top pt-3">SQL Content *</TableHead>
                    <TableCell colSpan={3}>
                      <Textarea value={editForm.sql_content ?? ""} onChange={(e) => setEditForm({ ...editForm, sql_content: e.target.value })} placeholder="SELECT * FROM ..." rows={6} className="font-mono text-sm" />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="bg-muted/30 align-top pt-3">Format</TableHead>
                    <TableCell colSpan={3}>
                      <FormatConfigEditor value={editForm.format_config} onChange={(v) => setEditForm({ ...editForm, format_config: v })} />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditMapping(null)}>Cancel</Button>
                <LoadingButton loading={updateMappingMutation.isPending} onClick={() => updateMappingMutation.mutate()} disabled={!editForm.sheet_name || !editForm.start_cell || !editForm.sql_content}>
                  Save Changes
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

function CellFormatPills({ label, fmt }: { label: string; fmt: CellFormat }) {
  const pills: { text: string; color?: string; bgColor?: string }[] = []
  if (fmt.font?.bold) pills.push({ text: "B" })
  if (fmt.font?.italic) pills.push({ text: "I" })
  if (fmt.font?.name) pills.push({ text: fmt.font.name })
  if (fmt.font?.size) pills.push({ text: `${fmt.font.size}pt` })
  if (fmt.font?.color) pills.push({ text: `#${fmt.font.color}`, color: fmt.font.color })
  if (fmt.fill?.bg_color) pills.push({ text: "fill", bgColor: fmt.fill.bg_color })
  if (fmt.border?.style) pills.push({ text: `border: ${fmt.border.style}` })
  if (fmt.alignment?.horizontal) pills.push({ text: fmt.alignment.horizontal })
  if (fmt.alignment?.wrap_text) pills.push({ text: "wrap" })
  if (fmt.number_format) pills.push({ text: fmt.number_format })
  if (pills.length === 0) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">{label}</span>
      {pills.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-muted rounded px-1.5 py-0.5">
          {p.color && <span className="w-2.5 h-2.5 rounded-full border border-border shrink-0" style={{ backgroundColor: `#${p.color}` }} />}
          {p.bgColor && <span className="w-2.5 h-2.5 rounded-full border border-border shrink-0" style={{ backgroundColor: `#${p.bgColor}` }} />}
          {p.text}
        </span>
      ))}
    </div>
  )
}

function FormatSummary({ config }: { config: FormatConfig }) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* Global options */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {config.auto_fit && (
          <span className="inline-flex items-center text-[11px] bg-blue-500/15 text-blue-400 rounded px-1.5 py-0.5">
            auto-fit{config.auto_fit_max_width ? ` ≤${config.auto_fit_max_width}` : ""}
          </span>
        )}
        {config.wrap_text && (
          <span className="inline-flex items-center text-[11px] bg-blue-500/15 text-blue-400 rounded px-1.5 py-0.5">
            wrap-text
          </span>
        )}
        {config.column_widths && Object.keys(config.column_widths).length > 0 && (
          <span className="inline-flex items-center text-[11px] bg-muted rounded px-1.5 py-0.5 font-mono">
            widths: {Object.entries(config.column_widths).map(([c, w]) => `${c}=${w}`).join(" ")}
          </span>
        )}
      </div>
      {config.header && <CellFormatPills label="Header" fmt={config.header} />}
      {config.data && <CellFormatPills label="Data" fmt={config.data} />}
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
    format_config: template.format_config || null,
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
      format_config: template.format_config || null,
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
        format_config: form.format_config,
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
                <TableHead>Default Format</TableHead>
                <TableCell>
                  {template.format_config ? (
                    <pre className="font-mono text-xs bg-muted/50 rounded p-2 max-h-[120px] overflow-y-auto whitespace-pre-wrap">
                      {JSON.stringify(template.format_config, null, 2)}
                    </pre>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </TableCell>
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
            <TableRow>
              <TableHead>Default Format</TableHead>
              <TableCell>
                <FormatConfigEditor
                  value={form.format_config}
                  onChange={(v) => setForm({ ...form, format_config: v })}
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
