import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { BucketSelect } from "@/components/ReportManagement/BucketSelect"
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
import useCustomToast from "@/hooks/useCustomToast"
import { ClientsService } from "@/services/clients"
import { DataSourceService } from "@/services/datasource"
import {
  type ReportTemplateCreate,
  ReportModuleService,
} from "@/services/report"

export const Route = createFileRoute("/_layout/report-management/modules/$id")({
  component: ModuleDetailPage,
  head: () => ({
    meta: [{ title: "Module Detail - Report Management" }],
  }),
})

function ModuleDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // Fetch module detail
  const { data: module, isLoading } = useQuery({
    queryKey: ["report-module", id],
    queryFn: () => ReportModuleService.get(id),
  })

  // Fetch all datasources
  const { data: dsData } = useQuery({
    queryKey: ["datasources-all"],
    queryFn: () => DataSourceService.list({ page: 1, page_size: 100 }),
  })

  // Fetch all clients
  const { data: clientsData } = useQuery({
    queryKey: ["clients-all"],
    queryFn: () => ClientsService.list({ page: 1, page_size: 100 }),
  })

  // --- Config tab state ---
  const [editConfig, setEditConfig] = useState(false)
  const [configName, setConfigName] = useState("")
  const [configDesc, setConfigDesc] = useState("")
  const [configMinio, setConfigMinio] = useState("")
  const [configSql, setConfigSql] = useState("")
  const [configTemplateBucket, setConfigTemplateBucket] = useState("")
  const [configOutputBucket, setConfigOutputBucket] = useState("")

  useEffect(() => {
    if (module) {
      setConfigName(module.name)
      setConfigDesc(module.description || "")
      setConfigMinio(module.minio_datasource_id)
      setConfigSql(module.sql_datasource_id)
      setConfigTemplateBucket(module.default_template_bucket || "")
      setConfigOutputBucket(module.default_output_bucket || "")
    }
  }, [module])

  const updateModuleMutation = useMutation({
    mutationFn: () =>
      ReportModuleService.update({
        id,
        name: configName,
        description: configDesc || null,
        minio_datasource_id: configMinio,
        sql_datasource_id: configSql,
        default_template_bucket: configTemplateBucket,
        default_output_bucket: configOutputBucket,
      }),
    onSuccess: () => {
      showSuccessToast("Module updated successfully")
      queryClient.invalidateQueries({ queryKey: ["report-module", id] })
      setEditConfig(false)
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  // --- Templates tab ---
  const [showCreateTemplate, setShowCreateTemplate] = useState(false)
  const [newTemplate, setNewTemplate] = useState<ReportTemplateCreate>({
    name: "",
    template_bucket: "",
    template_path: "",
    output_bucket: "",
    output_prefix: "",
    recalc_enabled: false,
    output_sheet: null,
  })

  const createTemplateMutation = useMutation({
    mutationFn: () => ReportModuleService.createTemplate(id, newTemplate),
    onSuccess: () => {
      showSuccessToast("Template created successfully")
      queryClient.invalidateQueries({ queryKey: ["report-module", id] })
      setShowCreateTemplate(false)
      setNewTemplate({
        name: "",
        template_bucket: "",
        template_path: "",
        output_bucket: "",
        output_prefix: "",
        recalc_enabled: false,
        output_sheet: null,
      })
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: (templateId: string) =>
      ReportModuleService.deleteTemplate(id, templateId),
    onSuccess: () => {
      showSuccessToast("Template deleted successfully")
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
    if (checked) {
      setSelectedClientIds((prev) => [...prev, clientId])
    } else {
      setSelectedClientIds((prev) => prev.filter((cid) => cid !== clientId))
    }
  }

  const minioDatasources =
    dsData?.data.filter((ds) => (ds.product_type as string) === "minio") || []
  const sqlDatasources =
    dsData?.data.filter((ds) => (ds.product_type as string) !== "minio") || []

  const getDsName = (dsId: string) => {
    const ds = dsData?.data.find((d) => d.id === dsId)
    return ds ? ds.name : dsId
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link to="/report-management/modules">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{module.name}</h1>
          <p className="text-muted-foreground">
            {module.description || "Report module detail"}
          </p>
        </div>
        <Badge variant={module.is_active ? "default" : "secondary"}>
          {module.is_active ? "Active" : "Inactive"}
        </Badge>
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        {/* Config Tab */}
        <TabsContent value="config">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Module Configuration</CardTitle>
              {!editConfig && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditConfig(true)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {editConfig ? (
                <>
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableHead className="w-[200px]">Name</TableHead>
                        <TableCell>
                          <Input value={configName} onChange={(e) => setConfigName(e.target.value)} />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableCell>
                          <Textarea value={configDesc} onChange={(e) => setConfigDesc(e.target.value)} />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead>MinIO Datasource</TableHead>
                        <TableCell>
                          <Select value={configMinio} onValueChange={setConfigMinio}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {minioDatasources.map((ds) => (<SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead>SQL Datasource</TableHead>
                        <TableCell>
                          <Select value={configSql} onValueChange={setConfigSql}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {sqlDatasources.map((ds) => (<SelectItem key={ds.id} value={ds.id}>{ds.name} ({ds.product_type})</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead>Default Template Bucket</TableHead>
                        <TableCell>
                          <BucketSelect datasourceId={configMinio || undefined} value={configTemplateBucket} onChange={setConfigTemplateBucket} placeholder="Select template bucket" />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead>Default Output Bucket</TableHead>
                        <TableCell>
                          <BucketSelect datasourceId={configMinio || undefined} value={configOutputBucket} onChange={setConfigOutputBucket} placeholder="Select output bucket" />
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  <div className="flex gap-2 mt-4">
                    <LoadingButton
                      loading={updateModuleMutation.isPending}
                      onClick={() => updateModuleMutation.mutate()}
                    >
                      Save
                    </LoadingButton>
                    <Button
                      variant="outline"
                      onClick={() => setEditConfig(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableHead className="w-[180px]">Name</TableHead>
                      <TableCell>{module.name}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableHead className="w-[180px]">Description</TableHead>
                      <TableCell>
                        {module.description || (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableHead className="w-[180px]">
                        MinIO Datasource
                      </TableHead>
                      <TableCell>
                        {getDsName(module.minio_datasource_id)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableHead className="w-[180px]">
                        SQL Datasource
                      </TableHead>
                      <TableCell>
                        {getDsName(module.sql_datasource_id)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableHead className="w-[180px]">
                        Default Template Bucket
                      </TableHead>
                      <TableCell className="font-mono text-sm">
                        {module.default_template_bucket || <span className="text-muted-foreground">--</span>}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableHead className="w-[180px]">
                        Default Output Bucket
                      </TableHead>
                      <TableCell className="font-mono text-sm">
                        {module.default_output_bucket || <span className="text-muted-foreground">--</span>}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableHead className="w-[180px]">Created</TableHead>
                      <TableCell>
                        {new Date(module.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab — simple list with links */}
        <TabsContent value="templates">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Templates in this module</CardTitle>
              <Link to="/report-management/templates/create" search={{ module_id: id }}>
                <Button size="sm">
                  <Plus className="mr-2 h-3 w-3" />
                  Create Template
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {module.templates && module.templates.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {module.templates.map((tpl) => (
                      <TableRow key={tpl.id}>
                        <TableCell>
                          <Link
                            to="/report-management/templates/$tid"
                            params={{ tid: tpl.id }}
                            className="font-medium hover:underline"
                          >
                            {tpl.name}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {tpl.template_path || "Blank"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={tpl.is_active ? "default" : "secondary"}>
                            {tpl.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(tpl.updated_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No templates yet.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  )
}
