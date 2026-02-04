import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Globe, Pencil, Trash2, RotateCcw, EyeOff, Copy, Check, Terminal, Play, Loader2, Plus, X, Braces, GitBranch, Undo2, User } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useState, useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LoadingButton } from "@/components/ui/loading-button"
import { ApiAssignmentsService, type VersionCommitPublic, type VersionCommitDetail } from "@/services/api-assignments"
import { ModulesService } from "@/services/modules"
import { MacroDefsService } from "@/services/macro-defs"
import { DataSourceService } from "@/services/datasource"
import { GroupsService } from "@/services/groups"
import ApiContentEditor from "@/components/ApiDev/ApiContentEditor"
import ApiContentExamples from "@/components/ApiDev/ApiContentExamples"
import ParamValidateExamples from "@/components/ApiDev/ParamValidateExamples"
import ParamsExample from "@/components/ApiDev/ParamsExample"
import {
  RESULT_TRANSFORM_PLACEHOLDER,
  SCRIPT_CONTENT_PLACEHOLDER,
  SQL_CONTENT_PLACEHOLDER,
} from "@/components/ApiDev/apiContentPlaceholders"
import ResultTransformExamples from "@/components/ApiDev/ResultTransformExamples"
import SqlStatementsEditor from "@/components/ApiDev/SqlStatementsEditor"
import useCustomToast from "@/hooks/useCustomToast"
import { usePermissions } from "@/hooks/usePermissions"
import { getGatewayApiKey } from "@/lib/gatewayApiKey"

export const Route = createFileRoute("/_layout/api-dev/apis/$id")({
  component: ApiDetail,
  head: () => ({
    meta: [
      {
        title: "API Detail",
      },
    ],
  }),
})

function ApiDetail() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { hasPermission } = usePermissions()
  const canUpdate = hasPermission("api_assignment", "update", id)
  const canDelete = hasPermission("api_assignment", "delete", id)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedContent, setCopiedContent] = useState(false)
  const [queryParams, setQueryParams] = useState<Array<{ key: string; value: string }>>([])
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>([])
  const [body, setBody] = useState("{}")
  const [response, setResponse] = useState<{ status?: number; data?: unknown; error?: string } | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [tokenHeaders, setTokenHeaders] = useState<Array<{ key: string; value: string }>>([{ key: "Content-Type", value: "application/json" }])
  const [tokenBody, setTokenBody] = useState('{"client_id": "", "client_secret": ""}')
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)
  const [isGeneratingToken, setIsGeneratingToken] = useState(false)
  const [tokenResponse, setTokenResponse] = useState<{ status?: number; data?: unknown; error?: string } | null>(null)
  const [versions, setVersions] = useState<VersionCommitPublic[]>([])
  const [selectedVersion, setSelectedVersion] = useState<VersionCommitDetail | null>(null)
  const [createVersionDialogOpen, setCreateVersionDialogOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState("")
  const [publishVersionDialogOpen, setPublishVersionDialogOpen] = useState(false)
  const [selectedVersionForPublish, setSelectedVersionForPublish] = useState<string | null>(null)
  const [deleteVersionDialogOpen, setDeleteVersionDialogOpen] = useState(false)
  const [versionToDelete, setVersionToDelete] = useState<string | null>(null)
  const [restoreVersionDialogOpen, setRestoreVersionDialogOpen] = useState(false)
  const [versionToRestore, setVersionToRestore] = useState<string | null>(null)
  const { handleSubmit } = useForm()

  // Check if we're on the edit route
  const isEditRoute = matchRoute({ to: "/api-dev/apis/$id/edit" })

  // Fetch API detail
  const { data: apiDetail, isLoading } = useQuery({
    queryKey: ["api-assignment", id],
    queryFn: () => ApiAssignmentsService.get(id),
    enabled: !isEditRoute, // Don't fetch when on edit route
  })

  // Fetch versions
  const { data: versionsData, refetch: refetchVersions } = useQuery({
    queryKey: ["api-versions", id],
    queryFn: () => ApiAssignmentsService.listVersions(id),
    enabled: !!id,
  })

  useEffect(() => {
    if (versionsData?.data) {
      setVersions(versionsData.data)
    }
  }, [versionsData])

  // Fetch related data
  const { data: module } = useQuery({
    queryKey: ["module", apiDetail?.module_id],
    queryFn: () => apiDetail ? ModulesService.get(apiDetail.module_id) : null,
    enabled: !!apiDetail,
  })

  const { data: datasource } = useQuery({
    queryKey: ["datasource", apiDetail?.datasource_id],
    queryFn: () => apiDetail?.datasource_id ? DataSourceService.get(apiDetail.datasource_id) : null,
    enabled: !!apiDetail?.datasource_id,
  })

  const { data: groupsData } = useQuery({
    queryKey: ["groups-simple"],
    queryFn: () => GroupsService.list(),
  })

  const { data: macroDefsData } = useQuery({
    queryKey: ["macro-defs-in-scope", apiDetail?.module_id],
    queryFn: () => MacroDefsService.listSimple(apiDetail?.module_id || undefined),
    enabled: !!apiDetail?.module_id,
  })
  const macroDefsForEditor = macroDefsData ?? []

  // Create version mutation
  const createVersionMutation = useMutation({
    mutationFn: () => ApiAssignmentsService.createVersion(id, { commit_message: commitMessage || null }),
    onSuccess: () => {
      showSuccessToast("Version created successfully")
      setCreateVersionDialogOpen(false)
      setCommitMessage("")
      refetchVersions()
      queryClient.invalidateQueries({ queryKey: ["api-assignment", id] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  // Delete version mutation
  const deleteVersionMutation = useMutation({
    mutationFn: () => {
      if (!versionToDelete) throw new Error("No version selected")
      return ApiAssignmentsService.deleteVersion(versionToDelete)
    },
    onSuccess: () => {
      showSuccessToast("Version deleted successfully")
      setDeleteVersionDialogOpen(false)
      setVersionToDelete(null)
      refetchVersions()
      queryClient.invalidateQueries({ queryKey: ["api-assignment", id] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  // Revert version to draft (clear published_version_id when API is not published)
  const revertToDraftMutation = useMutation({
    mutationFn: (versionId: string) => ApiAssignmentsService.revertVersionToDraft(versionId),
    onSuccess: () => {
      showSuccessToast("Version reverted to draft")
      refetchVersions()
      queryClient.invalidateQueries({ queryKey: ["api-assignment", id] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  // Restore version mutation (overwrite current dev config with version snapshot)
  const restoreVersionMutation = useMutation({
    mutationFn: (versionId: string) => ApiAssignmentsService.restoreVersion(id, versionId),
    onSuccess: (data) => {
      showSuccessToast("Dev config restored from version successfully")
      setRestoreVersionDialogOpen(false)
      setVersionToRestore(null)
      setSelectedVersion(null)
      queryClient.setQueryData(["api-assignment", id], data)
      refetchVersions()
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersionForPublish) throw new Error("Please select a version to publish")
      return ApiAssignmentsService.publish({ 
        id, 
        version_id: selectedVersionForPublish
      })
    },
    onSuccess: () => {
      showSuccessToast("API published successfully")
      setPublishVersionDialogOpen(false)
      // Don't reset selectedVersionForPublish here - keep it for next time
      queryClient.invalidateQueries({ queryKey: ["api-assignment", id] })
      queryClient.invalidateQueries({ queryKey: ["api-assignments"] })
      refetchVersions()
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  // Unpublish mutation
  const unpublishMutation = useMutation({
    mutationFn: () => ApiAssignmentsService.unpublish({ id }),
    onSuccess: () => {
      showSuccessToast("API unpublished successfully")
      queryClient.invalidateQueries({ queryKey: ["api-assignment", id] })
      queryClient.invalidateQueries({ queryKey: ["api-assignments"] })
      refetchVersions()
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => ApiAssignmentsService.delete(id),
    onSuccess: () => {
      showSuccessToast("API deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["api-assignments"] })
      navigate({ to: "/api-dev/apis" })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const handlePublish = () => {
    if (versions.length === 0) {
      showErrorToast("Please create at least one version before publishing")
      return
    }
    // Pre-select current published version if exists
    if (apiDetail?.published_version_id) {
      setSelectedVersionForPublish(apiDetail.published_version_id)
    } else {
      // If no published version, select the latest version
      setSelectedVersionForPublish(versions[0]?.id || null)
    }
    setPublishVersionDialogOpen(true)
  }

  const handleDeleteVersion = (versionId: string) => {
    if (apiDetail?.published_version_id === versionId) {
      showErrorToast("Cannot delete published version. Please unpublish or publish another version first.")
      return
    }
    setVersionToDelete(versionId)
    setDeleteVersionDialogOpen(true)
  }

  const handleConfirmDeleteVersion = () => {
    deleteVersionMutation.mutate()
  }

  const handleRestoreVersion = (versionId: string) => {
    setVersionToRestore(versionId)
    setRestoreVersionDialogOpen(true)
  }

  const handleConfirmRestoreVersion = () => {
    if (versionToRestore) restoreVersionMutation.mutate(versionToRestore)
  }

  const handleCreateVersion = () => {
    if (!apiDetail?.api_context?.content) {
      showErrorToast("API has no content to version. Please add content first.")
      return
    }
    setCreateVersionDialogOpen(true)
  }

  const handleConfirmCreateVersion = () => {
    createVersionMutation.mutate()
  }

  const handleConfirmPublish = () => {
    publishMutation.mutate()
  }

  const handleUnpublish = () => {
    unpublishMutation.mutate()
  }

  const handleDelete = () => {
    deleteMutation.mutate()
  }

  // Build default values from params definition (always called, even if apiDetail is null)
  const defaultValues = useMemo(() => {
    if (!apiDetail?.api_context?.params || !Array.isArray(apiDetail.api_context.params)) {
      return { query: {}, header: {}, body: {} }
    }

    const defaults: { query: Record<string, string>; header: Record<string, string>; body: Record<string, unknown> } = {
      query: {},
      header: {},
      body: {},
    }

    apiDetail.api_context.params.forEach((param: { name?: string; location?: string; default_value?: string | null }) => {
      if (!param.name) return
      const location = param.location || "query"
      const defaultValue = param.default_value || ""
      
      if (defaultValue) {
        if (location === "query" || location === "header") {
          defaults[location][param.name] = defaultValue
        } else if (location === "body") {
          try {
            defaults.body[param.name] = JSON.parse(defaultValue)
          } catch {
            defaults.body[param.name] = defaultValue
          }
        }
      }
    })

    return defaults
  }, [apiDetail?.api_context?.params])

  // Initialize form values with defaults (always called)
  useEffect(() => {
    if (apiDetail && defaultValues) {
      // Convert query params to key-value array
      const queryArray = Object.entries(defaultValues.query).map(([key, value]) => ({
        key,
        value: String(value),
      }))
      setQueryParams(queryArray.length > 0 ? queryArray : [{ key: "", value: "" }])

      // Convert headers to key-value array (JWT from Generate token or Settings → Gateway API Key)
      const gatewayToken = generatedToken || getGatewayApiKey()
      const defaultHeaders = {
        ...defaultValues.header,
        "Content-Type": "application/json",
        ...(apiDetail.access_type === "private" && gatewayToken ? { Authorization: `Bearer ${gatewayToken}` } : {}),
      }
      const headersArray = Object.entries(defaultHeaders).map(([key, value]) => ({
        key,
        value: String(value),
      }))
      setHeaders(headersArray.length > 0 ? headersArray : [{ key: "", value: "" }])
      
      setBody(JSON.stringify(defaultValues.body, null, 2))
    } else if (!apiDetail) {
      // Reset to defaults when apiDetail is not available
      setQueryParams([{ key: "", value: "" }])
      setHeaders([{ key: "Content-Type", value: "application/json" }])
      setBody("{}")
    }
  }, [apiDetail, defaultValues, generatedToken])

  // Update headers when token is generated or when Gateway API Key is set (Settings)
  useEffect(() => {
    const gatewayToken = generatedToken || getGatewayApiKey()
    if (apiDetail?.access_type === "private" && gatewayToken) {
      setHeaders((prev) => {
        const existing = prev.find((h) => h.key === "Authorization")
        if (existing) {
          return prev.map((h) =>
            h.key === "Authorization" ? { ...h, value: `Bearer ${gatewayToken}` } : h
          )
        } else {
          return [...prev, { key: "Authorization", value: `Bearer ${gatewayToken}` }]
        }
      })
    }
  }, [generatedToken, apiDetail?.access_type])

  // Build API URL with query params (must be before early returns)
  // Gateway: when path_prefix='/' use /{path}; otherwise /{module}/{path}
  const apiUrl = useMemo(() => {
    const currentModule = module
    const currentApiDetail = apiDetail
    if (!currentModule || !currentApiDetail) return ""
    const baseUrl = import.meta.env.VITE_API_URL || window.location.origin
    const apiPath = currentApiDetail.path.startsWith("/") ? currentApiDetail.path.slice(1) : currentApiDetail.path
    const isRootModule = !currentModule.path_prefix || currentModule.path_prefix.trim() === "/"
    const url = isRootModule
      ? `${baseUrl}/${apiPath}`
      : `${baseUrl}/${currentModule.path_prefix.trim().replace(/^\/+|\/+$/g, "")}/${apiPath}`
    
    // Add query params
    const validParams = queryParams.filter((p) => p.key && p.value)
    if (validParams.length > 0) {
      const urlObj = new URL(url)
      validParams.forEach(({ key, value }) => {
        urlObj.searchParams.append(key, value)
      })
      return urlObj.toString()
    }
    return url
  }, [module, apiDetail, queryParams])

  // If on edit route, only render Outlet (edit form)
  if (isEditRoute) {
    return <Outlet />
  }

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>
  }

  if (!apiDetail) {
    return <div className="text-center py-8 text-muted-foreground">API not found</div>
  }

  const assignedGroups = (Array.isArray(groupsData?.data) && apiDetail?.group_ids 
    ? groupsData.data.filter(g => apiDetail.group_ids.includes(g.id)) 
    : [])
  const methodColors: Record<string, string> = {
    GET: "bg-blue-500",
    POST: "bg-green-500",
    PUT: "bg-yellow-500",
    DELETE: "bg-red-500",
    PATCH: "bg-purple-500",
  }

  const handleGenerateToken = async () => {
    let bodyObj: Record<string, unknown> = {}
    try {
      bodyObj = JSON.parse(tokenBody || "{}")
    } catch {
      showErrorToast("Invalid JSON in Body")
      return
    }
    if (!bodyObj.client_id || !bodyObj.client_secret) {
      showErrorToast("Please set client_id and client_secret in the Body JSON")
      return
    }
    if (!bodyObj.grant_type) {
      bodyObj.grant_type = "client_credentials"
    }

    setIsGeneratingToken(true)
    setTokenResponse(null)
    try {
      const baseUrl = import.meta.env.VITE_API_URL || window.location.origin
      const tokenUrl = `${baseUrl}/token/generate`
      
      // Build headers
      const headersObj: Record<string, string> = {}
      tokenHeaders.forEach(({ key, value }) => {
        if (key && value) {
          headersObj[key] = value
        }
      })
      if (!headersObj["Content-Type"]) {
        headersObj["Content-Type"] = "application/json"
      }
      
      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: headersObj,
        body: JSON.stringify(bodyObj),
      })

      const responseData = await response.json().catch(() => ({ error: "Invalid JSON response" }))

      setTokenResponse({
        status: response.status,
        data: responseData,
      })

      if (!response.ok) {
        const detail = responseData.detail
        const msg = Array.isArray(detail)
          ? detail.map((e: { msg?: string }) => e.msg).filter(Boolean).join(", ") || `HTTP ${response.status}`
          : (typeof detail === "string" ? detail : `HTTP ${response.status}`)
        setTokenResponse({
          status: response.status,
          error: msg || `HTTP ${response.status}`,
        })
        showErrorToast(`Failed to generate token: ${msg || `HTTP ${response.status}`}`)
      } else {
        setGeneratedToken(responseData.access_token)
        showSuccessToast("Token generated successfully")
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setTokenResponse({
        error: errorMessage,
      })
      showErrorToast(`Failed to generate token: ${errorMessage}`)
    } finally {
      setIsGeneratingToken(false)
    }
  }

  const handleExecute = async () => {
    if (!apiUrl || !apiDetail) return

    if (apiDetail.access_type === "private") {
      const hasAuthHeader = headers.some((h) => h.key.toLowerCase() === "authorization" && h.value.trim())
      if (!hasAuthHeader) {
        showErrorToast("Please add Authorization header with Bearer token for private APIs")
        return
      }
    }

    setIsExecuting(true)
    setResponse(null)

    try {
      const headersObj: Record<string, string> = {}
      headers.forEach(({ key, value }) => {
        if (key && value) headersObj[key] = value
      })
      let bodyObj: unknown = null
      if (["POST", "PUT", "PATCH"].includes(apiDetail.http_method)) {
        try {
          bodyObj = JSON.parse(body || "{}")
        } catch {
          showErrorToast("Invalid JSON in Body")
          setIsExecuting(false)
          return
        }
      }

      const fetchResponse = await fetch(apiUrl, {
        method: apiDetail.http_method,
        headers: headersObj,
        ...(bodyObj !== null && { body: JSON.stringify(bodyObj) }),
      })
      const responseData = await fetchResponse.json().catch(() => ({ error: "Invalid JSON response" }))

      setResponse({ status: fetchResponse.status, data: responseData })
      if (fetchResponse.ok) {
        showSuccessToast("API executed successfully")
      } else {
        showErrorToast(`API returned status ${fetchResponse.status}`)
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      setResponse({ error: msg })
      showErrorToast(`Failed to execute API: ${msg}`)
    } finally {
      setIsExecuting(false)
    }
  }

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(apiUrl)
      setCopiedUrl(true)
      showSuccessToast("API URL copied to clipboard")
      setTimeout(() => setCopiedUrl(false), 2000)
    } catch {
      showErrorToast("Failed to copy URL")
    }
  }

  // Key-value table helpers
  const addKeyValue = (setter: React.Dispatch<React.SetStateAction<Array<{ key: string; value: string }>>>) => {
    setter((prev) => [...prev, { key: "", value: "" }])
  }

  const updateKeyValue = (
    setter: React.Dispatch<React.SetStateAction<Array<{ key: string; value: string }>>>,
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    setter((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const removeKeyValue = (
    setter: React.Dispatch<React.SetStateAction<Array<{ key: string; value: string }>>>,
    index: number
  ) => {
    setter((prev) => prev.filter((_, i) => i !== index))
  }

  // Key-value table component
  const KeyValueTable = ({
    data,
    onAdd,
    onUpdate,
    onRemove,
  }: {
    data: Array<{ key: string; value: string }>
    onAdd: () => void
    onUpdate: (index: number, field: "key" | "value", value: string) => void
    onRemove: (index: number) => void
  }) => {
    const safeData = Array.isArray(data) ? data : []
    return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Key</TableHead>
            <TableHead>Value</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {safeData.map((item, index) => (
            <TableRow key={`${index}-${item.key}-${item.value}`}>
              <TableCell>
                <Input
                  value={item.key}
                  onChange={(e) => onUpdate(index, "key", e.target.value)}
                  placeholder="Key"
                />
              </TableCell>
              <TableCell>
                <Input
                  value={item.value}
                  onChange={(e) => onUpdate(index, "value", e.target.value)}
                  placeholder="Value"
                />
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(index)}
                  disabled={safeData.length === 1}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button variant="outline" size="sm" onClick={onAdd} className="w-full">
        <Plus className="mr-2 h-4 w-4" />
        Add Row
      </Button>
    </div>
    )
  }

  const tokenBodyValid = (() => {
    try {
      const b = JSON.parse(tokenBody || "{}")
      return !!(b?.client_id && b?.client_secret)
    } catch {
      return false
    }
  })()

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1">
          <Link to="/api-dev/apis">
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold tracking-tight">{apiDetail.name}</h1>
              <Badge variant={apiDetail.is_published ? "default" : "outline"}>
                {apiDetail.is_published ? "Published" : "Draft"}
              </Badge>
              <Badge variant={apiDetail.access_type === "public" ? "default" : "secondary"}>
                {apiDetail.access_type === "public" ? "Public" : "Private"}
              </Badge>
            </div>
            {apiDetail.description && (
              <p className="text-muted-foreground text-base">
                {apiDetail.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {apiDetail.is_published ? (
            <Button
              onClick={handleUnpublish}
              disabled={unpublishMutation.isPending}
              variant="outline"
            >
              <EyeOff className="mr-2 h-4 w-4" />
              Unpublish
            </Button>
          ) : (
            <Button
              onClick={handlePublish}
              disabled={publishMutation.isPending}
            >
              <Globe className="mr-2 h-4 w-4" />
              Publish
            </Button>
          )}
          {canUpdate && (
            <Link to="/api-dev/apis/$id/edit" params={{ id }}>
              <Button variant="outline">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </Link>
          )}
          {canDelete && (
            <Button
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Main Content with Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>{apiDetail.name}</CardTitle>
          <CardDescription>View and test API details</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="configuration" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="configuration">API Configuration</TabsTrigger>
              <TabsTrigger value="content">API Execution Content</TabsTrigger>
              <TabsTrigger value="versions">Versions</TabsTrigger>
              <TabsTrigger value="testing">API Testing</TabsTrigger>
            </TabsList>

            <TabsContent value="configuration" className="space-y-6 mt-6">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableHead className="w-[180px]">Module</TableHead>
                    <TableCell>
                      {module?.name ? (
                        <Badge variant="outline" className="font-normal">
                          {module.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Path</TableHead>
                    <TableCell>
                      <Badge variant="outline" className="font-mono font-normal">
                        {apiDetail.path}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">HTTP Method</TableHead>
                    <TableCell>
                      <Badge className={methodColors[apiDetail.http_method] || "bg-gray-500"}>
                        {apiDetail.http_method}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Execute Engine</TableHead>
                    <TableCell>
                      <Badge variant="outline" className="uppercase">
                        {apiDetail.execute_engine}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Data Source</TableHead>
                    <TableCell>
                      {datasource?.name ? (
                        <Badge variant="outline" className="font-normal">
                          {datasource.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Assigned Groups</TableHead>
                    <TableCell>
                      {assignedGroups.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {assignedGroups.map((group) => (
                            <Badge key={group.id} variant="outline" className="font-normal">
                              {group.name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">API URL</TableHead>
                    <TableCell>
                      {apiUrl ? (
                        <div className="p-2 bg-muted rounded-md border font-mono text-xs break-all">
                          {apiUrl}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Created</TableHead>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(apiDetail.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Last Updated</TableHead>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(apiDetail.updated_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <div className="mt-6 border-t pt-6">
                <div className="mb-4">
                  <div className="text-sm font-medium">Parameters</div>
                  <div className="text-sm text-muted-foreground">
                    Parameters (query/header/body). Data type used for validation.
                  </div>
                </div>

                <ParamsExample />

                {apiDetail.api_context?.params && Array.isArray(apiDetail.api_context.params) && apiDetail.api_context.params.length > 0 ? (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableHead className="w-[140px]">Name</TableHead>
                          <TableHead className="w-[90px]">Location</TableHead>
                          <TableHead className="w-[100px]">Type</TableHead>
                          <TableHead className="w-[80px]">Required</TableHead>
                          <TableHead className="w-[110px]">Default</TableHead>
                          <TableHead className="min-w-[160px]">Description</TableHead>
                        </TableRow>
                        {apiDetail.api_context.params.map((p: unknown, idx: number) => {
                          const param = p as {
                            name?: string
                            location?: string
                            data_type?: string
                            is_required?: boolean
                            default_value?: unknown
                            description?: string | null
                          }
                          return (
                          <TableRow key={`param-${idx}-${param.name || ""}`}>
                            <TableCell className="font-mono text-sm">{param.name || "-"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-normal">
                                {param.location || "query"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-normal">
                                {param.data_type || "string"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={param.is_required ? "default" : "secondary"} className="font-normal">
                                {param.is_required ? "Yes" : "No"}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground break-all">
                              {param.default_value != null && String(param.default_value).trim() !== ""
                                ? String(param.default_value)
                                : "-"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" title={param.description || undefined}>
                              {param.description && param.description.trim() !== "" ? param.description : "-"}
                            </TableCell>
                          </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">-</div>
                )}
              </div>

              <div className="mt-6 border-t pt-6">
                <div className="mb-4">
                  <div className="text-sm font-medium">Parameter Validation</div>
                  <div className="text-sm text-muted-foreground">
                    Parameter validation scripts
                  </div>
                </div>

                <ParamValidateExamples />

                {(() => {
                  const paramValidates = (apiDetail.api_context as { param_validates?: unknown[] } | null)?.param_validates
                  return paramValidates && Array.isArray(paramValidates) && paramValidates.length > 0 ? (
                    <div className="rounded-md border">
                      <Table>
                        <TableBody>
                          <TableRow>
                            <TableHead className="w-[220px]">Name</TableHead>
                            <TableHead>Validation script (Python)</TableHead>
                            <TableHead className="w-[200px]">Message when fail</TableHead>
                          </TableRow>
                          {paramValidates.map((pv: unknown, idx: number) => {
                          const paramValidate = pv as {
                            name?: string
                            validation_script?: string | null
                            message_when_fail?: string | null
                          }
                          return (
                          <TableRow key={`param-validate-${idx}-${paramValidate.name || ""}`}>
                            <TableCell className="font-mono text-sm">{paramValidate.name || "-"}</TableCell>
                            <TableCell>
                              {paramValidate.validation_script && String(paramValidate.validation_script).trim() !== "" ? (
                                <ApiContentEditor
                                  executeEngine="SCRIPT"
                                  value={String(paramValidate.validation_script)}
                                  // Read-only viewer in detail page
                                  onChange={() => {}}
                                  disabled
                                  autoHeight
                                  minHeight={120}
                                  maxHeight={360}
                                  placeholder={
                                    "def validate(value, params=None):\n"
                                    + "    # return True/False\n"
                                    + "    return True\n"
                                  }
                                  paramNames={[]}
                                  macroDefs={macroDefsForEditor}
                                />
                              ) : (
                                <div className="text-sm text-muted-foreground">-</div>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground break-all">
                              {paramValidate.message_when_fail && String(paramValidate.message_when_fail).trim() !== ""
                                ? String(paramValidate.message_when_fail)
                                : "-"}
                            </TableCell>
                          </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">-</div>
                  )
                })()}
              </div>

            </TabsContent>

            <TabsContent value="content" className="mt-6">
              {apiDetail.api_context ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {apiDetail.execute_engine === "SQL" ? "SQL (Jinja2)" : "Python Script"}
                      </h3>
                      <p className="text-sm text-muted-foreground">API execution content</p>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(apiDetail.api_context?.content || "")
                        setCopiedContent(true)
                        setTimeout(() => setCopiedContent(false), 2000)
                        showSuccessToast("Content copied to clipboard")
                      }}
                      title="Copy content"
                    >
                      {copiedContent ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <ApiContentExamples executeEngine={apiDetail.execute_engine} />
                  {apiDetail.execute_engine === "SQL" ? (
                    <SqlStatementsEditor
                      value={apiDetail.api_context.content || ""}
                      onChange={() => {}}
                      disabled
                      placeholder={SQL_CONTENT_PLACEHOLDER}
                      paramNames={
                        apiDetail.api_context?.params && Array.isArray(apiDetail.api_context.params)
                          ? apiDetail.api_context.params.map((p: { name?: string }) => p.name).filter(Boolean) as string[]
                          : []
                      }
                      macroDefs={macroDefsForEditor}
                    />
                  ) : (
                    <ApiContentEditor
                      executeEngine="SCRIPT"
                      value={apiDetail.api_context.content || ""}
                      onChange={() => {}}
                      disabled
                      autoHeight
                      minHeight={260}
                      maxHeight={720}
                      placeholder={SCRIPT_CONTENT_PLACEHOLDER}
                      paramNames={[]}
                      macroDefs={macroDefsForEditor}
                    />
                  )}

                  <div className="border-t pt-6 mt-6">
                    <div className="mb-2">
                      <h3 className="text-lg font-semibold">Result transform (Python)</h3>
                      <p className="text-sm text-muted-foreground">
                        Python script to transform the raw executor result before returning
                      </p>
                    </div>
                    <ResultTransformExamples />
                    <div className="mt-4">
                      {apiDetail.api_context.result_transform && apiDetail.api_context.result_transform.trim() !== "" ? (
                        <ApiContentEditor
                          executeEngine="SCRIPT"
                          value={apiDetail.api_context.result_transform}
                          onChange={() => {}}
                          disabled
                          autoHeight
                          minHeight={260}
                          maxHeight={720}
                          placeholder={RESULT_TRANSFORM_PLACEHOLDER}
                          paramNames={[]}
                          macroDefs={macroDefsForEditor}
                        />
                      ) : (
                        <div className="text-sm text-muted-foreground">-</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No content available
                </div>
              )}
            </TabsContent>

            <TabsContent value="versions" className="mt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Content Versions</h3>
                    <p className="text-sm text-muted-foreground">Manage versions of API content</p>
                  </div>
                  <Button
                    onClick={handleCreateVersion}
                    disabled={!apiDetail?.api_context?.content}
                  >
                    <GitBranch className="mr-2 h-4 w-4" />
                    Create Version
                  </Button>
                </div>

                {versions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No versions created yet. Create a version to track changes to your API content.
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Version</TableHead>
                          <TableHead>Commit Message</TableHead>
                          <TableHead>Created By</TableHead>
                          <TableHead>Committed At</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {versions.map((version) => (
                          <TableRow key={version.id}>
                            <TableCell className="font-mono font-semibold">
                              v{version.version}
                            </TableCell>
                            <TableCell>
                              {version.commit_message || (
                                <span className="text-muted-foreground italic">No message</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {version.committed_by_email ? (
                                <div className="flex items-center gap-2">
                                  <User className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">
                                    {version.committed_by_email}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(version.committed_at).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {apiDetail?.published_version_id === version.id ? (
                                <Badge variant="default">Published</Badge>
                              ) : (
                                <Badge variant="outline">Draft</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      const versionDetail = await ApiAssignmentsService.getVersion(version.id)
                                      setSelectedVersion(versionDetail)
                                    } catch (error) {
                                      showErrorToast(error instanceof Error ? error.message : "Failed to load version")
                                    }
                                  }}
                                >
                                  View
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRestoreVersion(version.id)}
                                  title="Restore this version into current dev config (content, params, validations, result transform)"
                                >
                                  <RotateCcw className="mr-1 h-4 w-4" />
                                  Restore
                                </Button>
                                {!apiDetail?.is_published &&
                                  apiDetail?.published_version_id === version.id && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => revertToDraftMutation.mutate(version.id)}
                                      disabled={!canUpdate || revertToDraftMutation.isPending}
                                      title="Revert this version to draft (only when API is not published)"
                                    >
                                      <Undo2 className="mr-1 h-4 w-4" />
                                      Revert to draft
                                    </Button>
                                  )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteVersion(version.id)}
                                  disabled={!canDelete || apiDetail?.published_version_id === version.id}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="testing" className="mt-6">
              {apiDetail.is_published && apiUrl ? (
                <div className="space-y-6">
                  {/* Token Generation for Private APIs - First */}
                  {apiDetail.access_type === "private" && (
                    <div>
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold mb-2">Generate Token</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Set Headers and Body (JSON with client_id, client_secret) to generate an access token for testing this private API.
                        </p>
                        <div className="space-y-4">
                          {/* Token API URL */}
                          <div>
                            <div className="text-sm font-medium mb-2">Token API URL</div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 p-3 bg-muted rounded-md border font-mono text-sm break-all">
                                {(() => {
                                  const baseUrl = import.meta.env.VITE_API_URL || window.location.origin
                                  return `${baseUrl}/token/generate`
                                })()}
                              </div>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => {
                                  const baseUrl = import.meta.env.VITE_API_URL || window.location.origin
                                  const tokenUrl = `${baseUrl}/token/generate`
                                  navigator.clipboard.writeText(tokenUrl)
                                  showSuccessToast("Token URL copied to clipboard")
                                }}
                                title="Copy Token URL"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="text-sm font-medium">Headers</div>
                            <KeyValueTable
                              data={tokenHeaders.length > 0 ? tokenHeaders : [{ key: "Content-Type", value: "application/json" }]}
                              onAdd={() => addKeyValue(setTokenHeaders)}
                              onUpdate={(index, field, value) => updateKeyValue(setTokenHeaders, index, field, value)}
                              onRemove={(index) => removeKeyValue(setTokenHeaders, index)}
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="text-sm font-medium">Body</div>
                            <div className="relative">
                              <Textarea
                                value={tokenBody}
                                onChange={(e) => setTokenBody(e.target.value)}
                                placeholder='{"client_id": "", "client_secret": ""}'
                                className="font-mono min-h-[120px] pr-10"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 h-8 w-8"
                                onClick={() => {
                                  try {
                                    const parsed = JSON.parse(tokenBody || "{}")
                                    setTokenBody(JSON.stringify(parsed, null, 2))
                                    showSuccessToast("JSON formatted")
                                  } catch {
                                    showErrorToast("Invalid JSON format")
                                  }
                                }}
                                title="Format JSON"
                              >
                                <Braces className="h-4 w-4" />
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">JSON. Include client_id and client_secret. grant_type is added automatically if missing.</p>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={handleGenerateToken}
                              disabled={isGeneratingToken || !tokenBodyValid}
                            >
                              {isGeneratingToken ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <Terminal className="mr-2 h-4 w-4" />
                                  Generate Token
                                </>
                              )}
                            </Button>
                            {generatedToken && (
                              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                                <Check className="h-4 w-4" />
                                <span>Token generated successfully</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Token Response */}
                      {tokenResponse && (
                        <div className="mt-6 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-base font-semibold">Token Response</h4>
                            <div className="flex items-center gap-2">
                              {tokenResponse.status && (
                                <Badge variant={tokenResponse.status >= 200 && tokenResponse.status < 300 ? "default" : "destructive"}>
                                  {tokenResponse.status} {tokenResponse.status >= 200 && tokenResponse.status < 300 ? "OK" : "Error"}
                                </Badge>
                              )}
                              {!tokenResponse.error && tokenResponse.data != null && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      try {
                                        const formatted = JSON.stringify(tokenResponse.data, null, 2)
                                        navigator.clipboard.writeText(formatted)
                                        showSuccessToast("Response copied to clipboard")
                                      } catch {
                                        showErrorToast("Failed to copy response")
                                      }
                                    }}
                                    title="Copy response"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      try {
                                        const formatted = JSON.stringify(tokenResponse.data, null, 2)
                                        setTokenResponse({ ...tokenResponse, data: JSON.parse(formatted) })
                                        showSuccessToast("Response formatted")
                                      } catch {
                                        showErrorToast("Invalid JSON in response")
                                      }
                                    }}
                                    title="Format JSON"
                                  >
                                    <Braces className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="p-4 bg-muted rounded-lg border">
                            {tokenResponse.error ? (
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-destructive">Error</p>
                                <pre className="text-sm text-destructive font-mono whitespace-pre-wrap break-all">
                                  {tokenResponse.error}
                                </pre>
                              </div>
                            ) : (
                              <pre className="text-sm font-mono whitespace-pre-wrap break-all overflow-auto max-h-[500px] leading-relaxed">
                                {JSON.stringify(tokenResponse.data, null, 2)}
                              </pre>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Divider between Generate Token and Execute API */}
                  {apiDetail.access_type === "private" && (
                    <div className="border-t pt-6"></div>
                  )}

                  {/* Execute API */}
                  <div className={apiDetail.access_type === "private" ? "" : ""}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">Execute API</h3>
                        <p className="text-sm text-muted-foreground">Test the API with custom parameters</p>
                      </div>
                    </div>
                    
                    {/* API URL */}
                    <div className="mb-4">
                      <div className="text-sm font-medium mb-2">API URL</div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 p-3 bg-muted rounded-md border font-mono text-sm break-all">
                          {apiUrl}
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={handleCopyUrl}
                          title="Copy URL"
                        >
                          {copiedUrl ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Query Params, Headers, Body - No Tabs */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Query Params</div>
                        <KeyValueTable
                          data={queryParams.length > 0 ? queryParams : [{ key: "", value: "" }]}
                          onAdd={() => addKeyValue(setQueryParams)}
                          onUpdate={(index, field, value) => updateKeyValue(setQueryParams, index, field, value)}
                          onRemove={(index) => removeKeyValue(setQueryParams, index)}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Headers</div>
                        <KeyValueTable
                          data={headers.length > 0 ? headers : [{ key: "", value: "" }]}
                          onAdd={() => addKeyValue(setHeaders)}
                          onUpdate={(index, field, value) => updateKeyValue(setHeaders, index, field, value)}
                          onRemove={(index) => removeKeyValue(setHeaders, index)}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Body</div>
                        <div className="relative">
                          <Textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder='{"key": "value"}'
                            className="font-mono min-h-[120px] pr-10"
                            disabled={!["POST", "PUT", "PATCH"].includes(apiDetail.http_method)}
                          />
                          {["POST", "PUT", "PATCH"].includes(apiDetail.http_method) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute top-2 right-2 h-8 w-8"
                              onClick={() => {
                                try {
                                  const parsed = JSON.parse(body || "{}")
                                  setBody(JSON.stringify(parsed, null, 2))
                                  showSuccessToast("JSON formatted")
                                } catch {
                                  showErrorToast("Invalid JSON format")
                                }
                              }}
                              title="Format JSON"
                            >
                              <Braces className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {["POST", "PUT", "PATCH"].includes(apiDetail.http_method)
                            ? "JSON object for request body"
                            : "Body is not used for GET/DELETE requests"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">Execute API</h3>
                        <p className="text-sm text-muted-foreground">Test the API with custom parameters</p>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <Button
                        onClick={handleExecute}
                        disabled={isExecuting}
                        className="flex-1"
                      >
                        {isExecuting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Executing...
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-4 w-4" />
                            Execute API
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Response */}
                    {response && (
                      <div className="mt-6 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-base font-semibold">Response</h4>
                          <div className="flex items-center gap-2">
                            {response.status && (
                              <Badge variant={response.status >= 200 && response.status < 300 ? "default" : "destructive"}>
                                {response.status} {response.status >= 200 && response.status < 300 ? "OK" : "Error"}
                              </Badge>
                            )}
                            {!response.error && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    try {
                                      const formatted = JSON.stringify(response.data, null, 2)
                                      navigator.clipboard.writeText(formatted)
                                      showSuccessToast("Response copied to clipboard")
                                    } catch {
                                      showErrorToast("Failed to copy response")
                                    }
                                  }}
                                  title="Copy response"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    try {
                                      const formatted = JSON.stringify(response.data, null, 2)
                                      setResponse({ ...response, data: JSON.parse(formatted) })
                                      showSuccessToast("Response formatted")
                                    } catch {
                                      showErrorToast("Invalid JSON in response")
                                    }
                                  }}
                                  title="Format JSON"
                                >
                                  <Braces className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="p-4 bg-muted rounded-lg border">
                          {response.error ? (
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-destructive">Error</p>
                              <pre className="text-sm text-destructive font-mono whitespace-pre-wrap break-all">
                                {response.error}
                              </pre>
                            </div>
                          ) : (
                            <pre className="text-sm font-mono whitespace-pre-wrap break-all overflow-auto max-h-[500px] leading-relaxed">
                              {JSON.stringify(response.data, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-8">
                  {!apiDetail.is_published ? "API must be published to test" : "API URL not available"}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Render child routes (like edit) */}
      <Outlet />

      {/* Create Version Dialog */}
      <Dialog open={createVersionDialogOpen} onOpenChange={setCreateVersionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Version</DialogTitle>
            <DialogDescription>
              Create a new version of the current API content. This will snapshot the current content.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="commit-message">Commit Message (Optional)</Label>
              <Textarea
                id="commit-message"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Describe the changes in this version..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={createVersionMutation.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <LoadingButton
              onClick={handleConfirmCreateVersion}
              loading={createVersionMutation.isPending}
            >
              Create Version
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish Version Selection Dialog */}
      <Dialog 
        open={publishVersionDialogOpen} 
        onOpenChange={(open) => {
          setPublishVersionDialogOpen(open)
          if (!open) {
            // Reset selection when dialog closes
            setSelectedVersionForPublish(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publish API</DialogTitle>
            <DialogDescription>
              Select a version to publish. You must select a version to publish.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="version-select">Select Version *</Label>
              <Select
                value={selectedVersionForPublish || ""}
                onValueChange={(value) => setSelectedVersionForPublish(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a version" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((version) => (
                    <SelectItem key={version.id} value={version.id}>
                      v{version.version} - {version.commit_message || "No message"}
                      {apiDetail?.published_version_id === version.id && " (Current)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={publishMutation.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <LoadingButton
              onClick={handleConfirmPublish}
              loading={publishMutation.isPending}
              disabled={!selectedVersionForPublish}
            >
              Publish
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Version Dialog */}
      <Dialog open={deleteVersionDialogOpen} onOpenChange={setDeleteVersionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Version</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this version? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deleteVersionMutation.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <LoadingButton
              variant="destructive"
              onClick={handleConfirmDeleteVersion}
              loading={deleteVersionMutation.isPending}
            >
              Delete
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Version Dialog */}
      <Dialog
        open={restoreVersionDialogOpen}
        onOpenChange={(open) => {
          setRestoreVersionDialogOpen(open)
          if (!open) setVersionToRestore(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restore Version</DialogTitle>
            <DialogDescription>
              Are you sure you want to restore this version? Current dev config (content, parameters, validations, result transform) will be overwritten.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={restoreVersionMutation.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <LoadingButton
              onClick={handleConfirmRestoreVersion}
              loading={restoreVersionMutation.isPending}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restore
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Version Dialog */}
      <Dialog open={!!selectedVersion} onOpenChange={() => setSelectedVersion(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Version {selectedVersion?.version}</DialogTitle>
            <DialogDescription>
              {selectedVersion?.commit_message || "No commit message"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label>Content Snapshot</Label>
              <pre className="p-4 bg-muted rounded-md overflow-auto max-h-[400px] font-mono text-sm">
                {selectedVersion?.content_snapshot}
              </pre>
            </div>

            <div className="space-y-2">
              <Label>Parameters Snapshot</Label>
              {selectedVersion?.params_snapshot && Array.isArray(selectedVersion.params_snapshot) && selectedVersion.params_snapshot.length > 0 ? (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableHead className="w-[140px]">Name</TableHead>
                        <TableHead className="w-[90px]">Location</TableHead>
                        <TableHead className="w-[100px]">Type</TableHead>
                        <TableHead className="w-[80px]">Required</TableHead>
                        <TableHead className="w-[110px]">Default</TableHead>
                        <TableHead className="min-w-[160px]">Description</TableHead>
                      </TableRow>
                      {selectedVersion.params_snapshot.map((p: unknown, idx: number) => {
                        const param = p as {
                          name?: string
                          location?: string
                          data_type?: string
                          is_required?: boolean
                          default_value?: unknown
                          description?: string | null
                        }
                        return (
                          <TableRow key={`version-param-${idx}-${param.name || ""}`}>
                            <TableCell className="font-mono text-sm">{param.name || "-"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-normal">
                                {param.location || "query"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-normal">
                                {param.data_type || "string"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={param.is_required ? "default" : "secondary"} className="font-normal">
                                {param.is_required ? "Yes" : "No"}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground break-all">
                              {param.default_value != null && String(param.default_value).trim() !== ""
                                ? String(param.default_value)
                                : "-"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" title={param.description || undefined}>
                              {param.description && param.description.trim() !== "" ? param.description : "-"}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">-</div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Parameter Validation Snapshot</Label>
              {(() => {
                const paramValidates = selectedVersion?.param_validates_snapshot
                return paramValidates && Array.isArray(paramValidates) && paramValidates.length > 0 ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableHead className="w-[220px]">Name</TableHead>
                          <TableHead>Validation script (Python)</TableHead>
                          <TableHead className="w-[200px]">Message when fail</TableHead>
                        </TableRow>
                        {paramValidates.map((pv: unknown, idx: number) => {
                          const paramValidate = pv as {
                            name?: string
                            validation_script?: string | null
                            message_when_fail?: string | null
                          }
                          return (
                            <TableRow key={`version-param-validate-${idx}-${paramValidate.name || ""}`}>
                              <TableCell className="font-mono text-sm">{paramValidate.name || "-"}</TableCell>
                              <TableCell>
                                {paramValidate.validation_script && String(paramValidate.validation_script).trim() !== "" ? (
                                  <ApiContentEditor
                                    executeEngine="SCRIPT"
                                    value={String(paramValidate.validation_script)}
                                    // Read-only viewer in detail page
                                    onChange={() => {}}
                                    disabled
                                    autoHeight
                                    minHeight={120}
                                    maxHeight={360}
                                    placeholder={
                                      "def validate(value, params=None):\n"
                                      + "    # return True/False\n"
                                      + "    return True\n"
                                    }
                                    paramNames={[]}
                                    macroDefs={macroDefsForEditor}
                                  />
                                ) : (
                                  <div className="text-sm text-muted-foreground">-</div>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground break-all">
                                {paramValidate.message_when_fail && String(paramValidate.message_when_fail).trim() !== ""
                                  ? String(paramValidate.message_when_fail)
                                  : "-"}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">-</div>
                )
              })()}
            </div>

            <div className="space-y-2">
              <Label>Result Transform Snapshot</Label>
              {selectedVersion?.result_transform_snapshot && selectedVersion.result_transform_snapshot.trim() !== "" ? (
                <ApiContentEditor
                  executeEngine="SCRIPT"
                  value={selectedVersion.result_transform_snapshot}
                  // Read-only viewer in detail page
                  onChange={() => {}}
                  disabled
                  autoHeight
                  minHeight={260}
                  maxHeight={720}
                  placeholder={RESULT_TRANSFORM_PLACEHOLDER}
                  paramNames={[]}
                  macroDefs={macroDefsForEditor}
                />
              ) : (
                <div className="text-sm text-muted-foreground">-</div>
              )}
            </div>

            <div className="text-sm text-muted-foreground">
              <p>Committed at: {selectedVersion ? new Date(selectedVersion.committed_at).toLocaleString() : ""}</p>
              {selectedVersion?.committed_by_email && (
                <p>Created by: {selectedVersion.committed_by_email}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
            {selectedVersion && (
              <Button
                variant="default"
                onClick={() => handleRestoreVersion(selectedVersion.id)}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Restore to dev config
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit(handleDelete)}>
            <DialogHeader>
              <DialogTitle>Delete API</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{apiDetail.name}</strong>? 
                This action cannot be undone. All associated data (context, groups, etc.) will be permanently deleted.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button variant="outline" disabled={deleteMutation.isPending}>
                  Cancel
                </Button>
              </DialogClose>
              <LoadingButton
                variant="destructive"
                type="submit"
                loading={deleteMutation.isPending}
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
