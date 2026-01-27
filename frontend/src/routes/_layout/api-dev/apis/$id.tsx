import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Globe, Pencil, Trash2, EyeOff, Copy, Check, Terminal, Play, Loader2, Plus, X, Braces } from "lucide-react"
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
import { LoadingButton } from "@/components/ui/loading-button"
import { ApiAssignmentsService } from "@/services/api-assignments"
import { ModulesService } from "@/services/modules"
import { DataSourceService } from "@/services/datasource"
import { GroupsService } from "@/services/groups"
import useCustomToast from "@/hooks/useCustomToast"

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
  const { handleSubmit } = useForm()

  // Check if we're on the edit route
  const isEditRoute = matchRoute({ to: "/api-dev/apis/$id/edit" })

  // Fetch API detail
  const { data: apiDetail, isLoading } = useQuery({
    queryKey: ["api-assignment", id],
    queryFn: () => ApiAssignmentsService.get(id),
    enabled: !isEditRoute, // Don't fetch when on edit route
  })

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

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: () => ApiAssignmentsService.publish({ id }),
    onSuccess: () => {
      showSuccessToast("API published successfully")
      queryClient.invalidateQueries({ queryKey: ["api-assignment", id] })
      queryClient.invalidateQueries({ queryKey: ["api-assignments"] })
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

    apiDetail.api_context.params.forEach((param: { name?: string; location?: string; default_value?: string }) => {
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

      // Convert headers to key-value array
      const defaultHeaders = {
        ...defaultValues.header,
        "Content-Type": "application/json",
        ...(apiDetail.access_type === "private" && generatedToken ? { Authorization: `Bearer ${generatedToken}` } : {}),
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

  // Update headers when token is generated
  useEffect(() => {
    if (apiDetail?.access_type === "private" && generatedToken) {
      setHeaders((prev) => {
        const existing = prev.find((h) => h.key === "Authorization")
        if (existing) {
          return prev.map((h) =>
            h.key === "Authorization" ? { ...h, value: `Bearer ${generatedToken}` } : h
          )
        } else {
          return [...prev, { key: "Authorization", value: `Bearer ${generatedToken}` }]
        }
      })
    }
  }, [generatedToken, apiDetail?.access_type])

  // Build API URL with query params (must be before early returns)
  // Gateway pattern: /api/{module}/{path}
  // module is derived from module.path_prefix (strip leading/trailing slashes) or module name
  const apiUrl = useMemo(() => {
    const currentModule = module
    const currentApiDetail = apiDetail
    if (!currentModule || !currentApiDetail) return ""
    const baseUrl = import.meta.env.VITE_API_URL || window.location.origin
    // Get module segment from path_prefix or use module name as fallback
    let moduleSegment = ""
    if (currentModule.path_prefix && currentModule.path_prefix.trim() !== "/") {
      moduleSegment = currentModule.path_prefix.trim().replace(/^\/+|\/+$/g, "")
    } else {
      // Fallback: use module name (lowercase, replace spaces with hyphens)
      moduleSegment = currentModule.name.toLowerCase().replace(/\s+/g, "-")
    }
    const apiPath = currentApiDetail.path.startsWith("/") ? currentApiDetail.path.slice(1) : currentApiDetail.path
    let url = `${baseUrl}/api/${moduleSegment}/${apiPath}`
    
    // Add query params
    const validParams = queryParams.filter((p) => p.key && p.value)
    if (validParams.length > 0) {
      const urlObj = new URL(url)
      validParams.forEach(({ key, value }) => {
        urlObj.searchParams.append(key, value)
      })
      url = urlObj.toString()
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

    // For private APIs, check if Authorization header exists in headers (user may have edited/removed it)
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
      // Build headers from key-value array (use headers as-is, user can edit/remove token)
      const headersObj: Record<string, string> = {}
      headers.forEach(({ key, value }) => {
        if (key && value) {
          headersObj[key] = value
        }
      })

      // Parse body
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

      // Make request (URL already includes query params from buildApiUrl)
      const fetchOptions: RequestInit = {
        method: apiDetail.http_method,
        headers: headersObj,
      }

      if (bodyObj !== null) {
        fetchOptions.body = JSON.stringify(bodyObj)
      }

      const fetchResponse = await fetch(apiUrl, fetchOptions)
      const responseData = await fetchResponse.json().catch(() => ({ error: "Invalid JSON response" }))

      setResponse({
        status: fetchResponse.status,
        data: responseData,
      })

      if (fetchResponse.ok) {
        showSuccessToast("API executed successfully")
      } else {
        showErrorToast(`API returned status ${fetchResponse.status}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setResponse({
        error: errorMessage,
      })
      showErrorToast(`Failed to execute API: ${errorMessage}`)
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
          <Link to="/api-dev/apis/$id/edit" params={{ id }}>
            <Button variant="outline">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>
          <Button
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="configuration">API Configuration</TabsTrigger>
              <TabsTrigger value="content">API Execution Content</TabsTrigger>
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
                    <TableHead className="w-[180px]">DataSource</TableHead>
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
                  <div className="text-sm font-medium">Params</div>
                  <div className="text-sm text-muted-foreground">
                    Parameters defined for this API (query/header/body)
                  </div>
                </div>

                {apiDetail.api_context?.params && Array.isArray(apiDetail.api_context.params) && apiDetail.api_context.params.length > 0 ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableHead className="w-[220px]">Name</TableHead>
                          <TableHead className="w-[120px]">Location</TableHead>
                          <TableHead className="w-[140px]">Type</TableHead>
                          <TableHead className="w-[110px]">Required</TableHead>
                          <TableHead>Default</TableHead>
                        </TableRow>
                        {apiDetail.api_context.params.map((p: unknown, idx: number) => {
                          const param = p as {
                            name?: string
                            location?: string
                            data_type?: string
                            is_required?: boolean
                            default_value?: unknown
                          }
                          return (
                          <TableRow key={`${p?.name || "param"}-${idx}`}>
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
                  <div className="relative">
                    <pre className="p-4 bg-muted rounded-md overflow-auto max-h-[600px] font-mono text-sm leading-relaxed">
                      {apiDetail.api_context.content}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No content available
                </div>
              )}
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
                              {!tokenResponse.error && tokenResponse.data && (
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
