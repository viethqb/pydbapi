import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Globe, Pencil, Trash2, EyeOff, Copy, Check, Terminal, Play, Loader2 } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import { useState, useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
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
  const [copiedCurl, setCopiedCurl] = useState(false)
  const [copiedContent, setCopiedContent] = useState(false)
  const [queryParams, setQueryParams] = useState("{}")
  const [headers, setHeaders] = useState("{}")
  const [body, setBody] = useState("{}")
  const [response, setResponse] = useState<{ status?: number; data?: unknown; error?: string } | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
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
      setQueryParams(JSON.stringify(defaultValues.query, null, 2))
      const defaultHeaders = {
        ...defaultValues.header,
        "Content-Type": "application/json",
        ...(apiDetail.access_type === "private" ? { Authorization: "Bearer YOUR_TOKEN_HERE" } : {}),
      }
      setHeaders(JSON.stringify(defaultHeaders, null, 2))
      setBody(JSON.stringify(defaultValues.body, null, 2))
    } else if (!apiDetail) {
      // Reset to defaults when apiDetail is not available
      setQueryParams("{}")
      setHeaders('{"Content-Type": "application/json"}')
      setBody("{}")
    }
  }, [apiDetail, defaultValues])

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

  const assignedGroups = groupsData?.data.filter(g => apiDetail.group_ids.includes(g.id)) || []
  const methodColors: Record<string, string> = {
    GET: "bg-blue-500",
    POST: "bg-green-500",
    PUT: "bg-yellow-500",
    DELETE: "bg-red-500",
    PATCH: "bg-purple-500",
  }

  // Build API URL
  // Gateway pattern: /api/{module}/{path}
  // module is derived from module.path_prefix (strip leading/trailing slashes) or module name
  const buildApiUrl = () => {
    if (!module || !apiDetail) return ""
    const baseUrl = import.meta.env.VITE_API_URL || window.location.origin
    // Get module segment from path_prefix or use module name as fallback
    let moduleSegment = ""
    if (module.path_prefix && module.path_prefix.trim() !== "/") {
      moduleSegment = module.path_prefix.trim().replace(/^\/+|\/+$/g, "")
    } else {
      // Fallback: use module name (lowercase, replace spaces with hyphens)
      moduleSegment = module.name.toLowerCase().replace(/\s+/g, "-")
    }
    const apiPath = apiDetail.path.startsWith("/") ? apiDetail.path.slice(1) : apiDetail.path
    return `${baseUrl}/api/${moduleSegment}/${apiPath}`
  }

  const apiUrl = buildApiUrl()

  // Generate cURL command
  const generateCurlCommand = () => {
    if (!apiUrl || !apiDetail) return ""
    
    const method = apiDetail.http_method
    const needsAuth = apiDetail.access_type === "private"
    const hasBody = ["POST", "PUT", "PATCH"].includes(method)
    
    let curl = `curl -X ${method} "${apiUrl}"`
    
    // Add headers
    curl += ` \\\n  -H "Content-Type: application/json"`
    
    if (needsAuth) {
      curl += ` \\\n  -H "Authorization: Bearer YOUR_TOKEN_HERE"`
    }
    
    // Add body for POST/PUT/PATCH
    if (hasBody) {
      curl += ` \\\n  -d '{}'`
    }
    
    return curl
  }

  const curlCommand = generateCurlCommand()

  const handleExecute = async () => {
    if (!apiUrl || !apiDetail) return

    setIsExecuting(true)
    setResponse(null)

    try {
      // Parse inputs
      let queryObj: Record<string, string> = {}
      let headersObj: Record<string, string> = {}
      let bodyObj: unknown = null

      try {
        queryObj = JSON.parse(queryParams || "{}")
      } catch {
        showErrorToast("Invalid JSON in Query Parameters")
        setIsExecuting(false)
        return
      }

      try {
        headersObj = JSON.parse(headers || "{}")
      } catch {
        showErrorToast("Invalid JSON in Headers")
        setIsExecuting(false)
        return
      }

      if (["POST", "PUT", "PATCH"].includes(apiDetail.http_method)) {
        try {
          bodyObj = JSON.parse(body || "{}")
        } catch {
          showErrorToast("Invalid JSON in Body")
          setIsExecuting(false)
          return
        }
      }

      // Build URL with query params
      const url = new URL(apiUrl)
      Object.entries(queryObj).forEach(([key, value]) => {
        if (value !== "" && value !== null && value !== undefined) {
          url.searchParams.append(key, String(value))
        }
      })

      // Make request
      const fetchOptions: RequestInit = {
        method: apiDetail.http_method,
        headers: headersObj,
      }

      if (bodyObj !== null) {
        fetchOptions.body = JSON.stringify(bodyObj)
      }

      const fetchResponse = await fetch(url.toString(), fetchOptions)
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

  const handleCopyCurl = async () => {
    try {
      await navigator.clipboard.writeText(curlCommand)
      setCopiedCurl(true)
      showSuccessToast("cURL command copied to clipboard")
      setTimeout(() => setCopiedCurl(false), 2000)
    } catch {
      showErrorToast("Failed to copy cURL command")
    }
  }

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

      {/* API URL & cURL */}
      {apiDetail.is_published && apiUrl && (
        <Card>
          <CardHeader>
            <CardTitle>API Testing</CardTitle>
            <CardDescription>Copy URL or cURL command to test the API</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* API URL */}
            <div>
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

            {/* cURL Command */}
            <div>
              <div className="text-sm font-medium mb-2">cURL Command</div>
              <div className="flex items-start gap-2">
                <div className="flex-1 p-3 bg-muted rounded-md border font-mono text-xs overflow-x-auto">
                  <pre className="whitespace-pre-wrap break-all">{curlCommand}</pre>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyCurl}
                  title="Copy cURL"
                  className="shrink-0"
                >
                  {copiedCurl ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Terminal className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
              <div className="text-blue-600 dark:text-blue-400 mt-0.5">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-label="Information" role="img">
                  <title>Information</title>
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 text-xs text-blue-800 dark:text-blue-300">
                {apiDetail.access_type === "public" ? (
                  <p>This is a <strong>public API</strong> - no authentication required. You can call it directly.</p>
                ) : (
                  <p>This is a <strong>private API</strong> - requires authentication. Replace <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">YOUR_TOKEN_HERE</code> with a token from <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">/token/generate</code> endpoint.</p>
                )}
              </div>
            </div>

            {/* Execute API */}
            <div className="border-t pt-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Execute API</h3>
                  <p className="text-sm text-muted-foreground">Test the API with custom parameters</p>
                </div>
              </div>
              <Tabs defaultValue="query" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="query">Query Params</TabsTrigger>
                  <TabsTrigger value="headers">Headers</TabsTrigger>
                  <TabsTrigger value="body">Body</TabsTrigger>
                </TabsList>
                <TabsContent value="query" className="space-y-2">
                  <Textarea
                    value={queryParams}
                    onChange={(e) => setQueryParams(e.target.value)}
                    placeholder='{"key": "value"}'
                    className="font-mono min-h-[120px]"
                  />
                  <p className="text-xs text-muted-foreground">JSON object for query parameters</p>
                </TabsContent>
                <TabsContent value="headers" className="space-y-2">
                  <Textarea
                    value={headers}
                    onChange={(e) => setHeaders(e.target.value)}
                    placeholder='{"Content-Type": "application/json", "Authorization": "Bearer token"}'
                    className="font-mono min-h-[120px]"
                  />
                  <p className="text-xs text-muted-foreground">JSON object for HTTP headers</p>
                </TabsContent>
                <TabsContent value="body" className="space-y-2">
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder='{"key": "value"}'
                    className="font-mono min-h-[120px]"
                    disabled={!["POST", "PUT", "PATCH"].includes(apiDetail.http_method)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {["POST", "PUT", "PATCH"].includes(apiDetail.http_method)
                      ? "JSON object for request body"
                      : "Body is not used for GET/DELETE requests"}
                  </p>
                </TabsContent>
              </Tabs>

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
                    {response.status && (
                      <Badge variant={response.status >= 200 && response.status < 300 ? "default" : "destructive"}>
                        {response.status} {response.status >= 200 && response.status < 300 ? "OK" : "Error"}
                      </Badge>
                    )}
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
          </CardContent>
        </Card>
      )}

      {/* API Info */}
      <Card>
        <CardHeader>
          <CardTitle>API Configuration</CardTitle>
          <CardDescription>Core settings, metadata, and assigned groups</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Content */}
      {apiDetail.api_context && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {apiDetail.execute_engine === "SQL" ? "SQL (Jinja2)" : "Python Script"}
                </CardTitle>
                <CardDescription>API execution content</CardDescription>
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
          </CardHeader>
          <CardContent>
            <div className="relative">
              <pre className="p-4 bg-muted rounded-md overflow-auto max-h-[600px] font-mono text-sm leading-relaxed">
                {apiDetail.api_context.content}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

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
