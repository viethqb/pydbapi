import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Loader2, Play, Plus, Trash2 } from "lucide-react"
import { useState, useEffect, useRef, useCallback } from "react"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { LoadingButton } from "@/components/ui/loading-button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ApiAssignmentsService,
  type ApiAssignmentUpdate,
  type HttpMethodEnum,
  type ExecuteEngineEnum,
} from "@/services/api-assignments"
import { ModulesService } from "@/services/modules"
import { DataSourceService } from "@/services/datasource"
import { GroupsService } from "@/services/groups"
import useCustomToast from "@/hooks/useCustomToast"
import { Checkbox } from "@/components/ui/checkbox"

const paramSchema = z.object({
  name: z.string().min(1, "Parameter name is required"),
  location: z.enum(["query", "header", "body"]),
  data_type: z.string().optional().nullable(),
  is_required: z.boolean().default(false),
  validate_type: z.enum(["regex", "python"]).optional().nullable(),
  validate: z.string().optional().nullable(),
  default_value: z.string().optional().nullable(),
})

const formSchema = z.object({
  module_id: z.string().min(1, "Module is required"),
  name: z.string().min(1, "Name is required").max(255),
  path: z.string().min(1, "Path is required").max(255),
  http_method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  execute_engine: z.enum(["SQL", "SCRIPT"]),
  datasource_id: z.string().optional().nullable(),
  description: z.string().max(512).optional().nullable(),
  sort_order: z.number().int().default(0),
  content: z.string().optional().nullable(),
  group_ids: z.array(z.string()).default([]),
  params: z.array(paramSchema).default([]),
})

type FormValues = z.infer<typeof formSchema>

function parseFormValueToParam(
  raw: string,
  dataType: string | null | undefined
): string | number | boolean | unknown[] | Record<string, unknown> | null {
  const s = (raw ?? "").trim()
  if (s === "") return null
  const dt = (dataType || "string").toLowerCase()
  if (dt === "number" || dt === "integer") {
    const n = Number(s)
    return Number.isNaN(n) ? null : n
  }
  if (dt === "boolean") {
    return s === "true" || s === "1" || s.toLowerCase() === "yes"
  }
  if (dt === "array") {
    try {
      const parsed = JSON.parse(s) as unknown
      return Array.isArray(parsed) ? parsed : [s]
    } catch {
      return s.includes(",") ? s.split(",").map((x) => x.trim()) : [s]
    }
  }
  if (dt === "object") {
    try {
      return JSON.parse(s) as Record<string, unknown>
    } catch {
      return null
    }
  }
  return s
}

export const Route = createFileRoute("/_layout/api-dev/apis/$id/edit")({
  component: ApiEdit,
  head: () => ({
    meta: [
      {
        title: "Edit API",
      },
    ],
  }),
})

function ApiEdit() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [mainTab, setMainTab] = useState("basic")
  const [debugParams, setDebugParams] = useState("{}")
  const [debugInputMode, setDebugInputMode] = useState<"json" | "form">("form")
  const [debugFormValues, setDebugFormValues] = useState<Record<string, string>>({})
  const [debugResult, setDebugResult] = useState<unknown>(null)
  const [debugLoading, setDebugLoading] = useState(false)
  const paramsRef = useRef<string>("")

  // Fetch API detail
  const { data: apiDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["api-assignment", id],
    queryFn: () => ApiAssignmentsService.get(id),
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    defaultValues: {
      module_id: "",
      name: "",
      path: "",
      http_method: "GET",
      execute_engine: "SQL",
      datasource_id: null,
      description: null,
      sort_order: 0,
      content: "",
      group_ids: [],
      params: [],
    },
  })

  // Populate form when data loads
  useEffect(() => {
    if (apiDetail) {
      // Parse params from api_context if available
      let params: Array<{ name: string; location: "query" | "header" | "body"; data_type?: string | null; is_required?: boolean; validate_type?: "regex" | "python" | null; validate?: string | null; default_value?: string | null }> = []
      if (apiDetail.api_context?.params && Array.isArray(apiDetail.api_context.params)) {
        params = apiDetail.api_context.params.map((p: any) => ({
          name: p.name || "",
          location: (p.location || "query") as "query" | "header" | "body",
          data_type: p.data_type || null,
          is_required: p.is_required ?? false,
          validate_type: (p.validate_type || null) as "regex" | "python" | null,
          validate: p.validate || null,
          default_value: p.default_value || null,
        }))
      }
      // Ensure datasource_id is properly converted to string
      const datasourceId = apiDetail.datasource_id 
        ? (typeof apiDetail.datasource_id === 'string' 
            ? apiDetail.datasource_id 
            : String(apiDetail.datasource_id))
        : null
      
      form.reset({
        module_id: String(apiDetail.module_id),
        name: apiDetail.name,
        path: apiDetail.path,
        http_method: apiDetail.http_method,
        execute_engine: apiDetail.execute_engine,
        datasource_id: datasourceId,
        description: apiDetail.description || null,
        sort_order: apiDetail.sort_order,
        content: apiDetail.api_context?.content || "",
        group_ids: apiDetail.group_ids?.map(id => String(id)) || [],
        params: params,
      })
      
    }
  }, [apiDetail, form])

  const executeEngine = form.watch("execute_engine")

  // Fetch modules, datasources, and groups
  const { data: modulesData } = useQuery({
    queryKey: ["modules-simple"],
    queryFn: () => ModulesService.listSimple(),
  })

  const { data: datasourcesData } = useQuery({
    queryKey: ["datasources-simple"],
    queryFn: () => DataSourceService.list({ 
      page: 1, 
      page_size: 100,
    }),
  })

  const { data: groupsData } = useQuery({
    queryKey: ["groups-simple"],
    queryFn: () => GroupsService.list(),
  })

  const updateMutation = useMutation({
    mutationFn: (data: ApiAssignmentUpdate) => ApiAssignmentsService.update(data),
    onSuccess: () => {
      showSuccessToast("API updated successfully")
      queryClient.invalidateQueries({ queryKey: ["api-assignment", id] })
      queryClient.invalidateQueries({ queryKey: ["api-assignments"] })
      navigate({ to: "/api-dev/apis/$id", params: { id } })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const buildParamsFromForm = (): Record<string, unknown> => {
    const paramsDef = form.getValues().params ?? []
    const out: Record<string, unknown> = {}
    for (const p of paramsDef) {
      const name = p?.name?.trim()
      if (!name) continue
      // Use user input if provided, otherwise use default_value
      const raw = debugFormValues[name] ?? p?.default_value ?? ""
      const v = parseFormValueToParam(raw, p.data_type ?? undefined)
      if (v !== null && v !== "") out[name] = v
    }
    return out
  }

  // Helper to fill default values into form + JSON
  const fillDefaultValues = useCallback((force = false) => {
    const paramsDef = form.getValues().params ?? []
    const paramsKey = JSON.stringify(
      paramsDef.map((p) => ({ name: p?.name, default_value: p?.default_value }))
    )
    if (!force && paramsRef.current === paramsKey) return
    paramsRef.current = paramsKey

    const newFormValues: Record<string, string> = {}
    const jsonParams: Record<string, unknown> = {}

    for (const p of paramsDef) {
      const name = p?.name?.trim()
      if (!name) continue
      const defaultValue = p?.default_value
      if (defaultValue) {
        newFormValues[name] = defaultValue
        const dataType = (p?.data_type ?? "string").toLowerCase()
        const parsed = parseFormValueToParam(defaultValue, dataType)
        if (parsed !== null && parsed !== "") {
          jsonParams[name] = parsed
        }
      }
    }

    // Form: defaults as base, existing user values override
    setDebugFormValues((prev) => ({ ...newFormValues, ...prev }))

    // JSON: defaults as base, then merge current JSON (user overrides)
    if (Object.keys(jsonParams).length > 0) {
      setDebugParams((prev) => {
        try {
          const currentJson = JSON.parse(prev || "{}") as Record<string, unknown>
          const merged = { ...jsonParams, ...currentJson }
          return JSON.stringify(merged, null, 2)
        } catch {
          return JSON.stringify(jsonParams, null, 2)
        }
      })
    }
  }, [form])

  // Auto-fill default values when params change (using subscription)
  useEffect(() => {
    const subscription = form.watch((_value, { name }) => {
      if (name === "params") {
        fillDefaultValues()
      }
    })
    return () => subscription.unsubscribe()
  }, [form, fillDefaultValues])

  // Fill default values when form is reset with apiDetail
  useEffect(() => {
    if (apiDetail) {
      const t = setTimeout(() => {
        fillDefaultValues(true)
      }, 100)
      return () => clearTimeout(t)
    }
  }, [apiDetail, fillDefaultValues])

  const handleDebug = async () => {
    const values = form.getValues()
    if (!values.content) {
      showErrorToast("Please enter content to debug")
      return
    }

    setDebugLoading(true)
    setDebugResult(null)

    try {
      let paramsObj: Record<string, unknown> = {}
      if (debugInputMode === "form") {
        paramsObj = buildParamsFromForm()
      } else {
        try {
          paramsObj = JSON.parse(debugParams) as Record<string, unknown>
        } catch {
          showErrorToast("Invalid JSON in params")
          setDebugLoading(false)
          return
        }
      }

      const result = await ApiAssignmentsService.debug({
        id: id,
        params: paramsObj,
      })

      setDebugResult(result)
      if (result && typeof result === "object" && "error" in result && result.error) {
        showErrorToast(String(result.error))
      } else {
        showSuccessToast("Debug executed successfully")
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      showErrorToast(errorMessage)
      setDebugResult({ error: errorMessage })
    } finally {
      setDebugLoading(false)
    }
  }

  const onSubmit = (values: FormValues) => {
    updateMutation.mutate({
      id: id,
      module_id: values.module_id,
      name: values.name,
      path: values.path,
      http_method: values.http_method,
      execute_engine: values.execute_engine,
      datasource_id: values.datasource_id || null,
      description: values.description || null,
      sort_order: values.sort_order,
      content: values.content || null,
      group_ids: values.group_ids,
      params: values.params.length > 0 ? values.params : null,
    })
  }

  if (detailLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>
  }

  if (!apiDetail) {
    return <div className="text-center py-8 text-muted-foreground">API not found</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Edit API</h1>
        <p className="text-muted-foreground">Edit API assignment</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs
            value={mainTab}
            onValueChange={(v) => {
              setMainTab(v)
              if (v === "debug") fillDefaultValues(true)
            }}
            className="w-full"
          >
            <TabsList>
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="debug">Debug</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="module_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Module *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ""}
                        key={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select module" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {modulesData?.map((m) => (
                            <SelectItem key={m.id} value={String(m.id)}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="My API" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="path"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Path *</FormLabel>
                      <FormControl>
                        <Input placeholder="users or users/{id}" {...field} />
                      </FormControl>
                      <FormDescription>
                        Path within module (e.g., "users" or "users/{id}")
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="http_method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>HTTP Method *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="GET">GET</SelectItem>
                          <SelectItem value="POST">POST</SelectItem>
                          <SelectItem value="PUT">PUT</SelectItem>
                          <SelectItem value="DELETE">DELETE</SelectItem>
                          <SelectItem value="PATCH">PATCH</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="execute_engine"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Execute Engine *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="SQL">SQL</SelectItem>
                          <SelectItem value="SCRIPT">SCRIPT</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="datasource_id"
                  render={({ field }) => {
                    // Ensure value is string for comparison
                    const fieldValue = field.value ? String(field.value) : "none"
                    return (
                      <FormItem>
                        <FormLabel>DataSource</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                          value={fieldValue}
                          key={fieldValue}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select datasource" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {datasourcesData?.data && datasourcesData.data.length > 0 ? (
                              datasourcesData.data.map((ds) => {
                                const dsId = String(ds.id)
                                return (
                                  <SelectItem key={dsId} value={dsId}>
                                    {ds.name}
                                  </SelectItem>
                                )
                              })
                            ) : (
                              <SelectItem value="no-data" disabled>
                                No datasources available
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Required for SQL and SCRIPT engines
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )
                  }}
                />

                <FormField
                  control={form.control}
                  name="sort_order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Order</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Optional description"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="group_ids"
                render={() => (
                  <FormItem>
                    <div className="mb-4">
                      <FormLabel>Groups</FormLabel>
                      <FormDescription>
                        Select groups to assign this API to
                      </FormDescription>
                    </div>
                    {groupsData?.data && groupsData.data.length > 0 ? (
                      groupsData.data.map((group) => (
                        <FormField
                          key={group.id}
                          control={form.control}
                          name="group_ids"
                          render={({ field }) => {
                            return (
                              <FormItem
                                key={group.id}
                                className="flex flex-row items-start space-x-3 space-y-0"
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(group.id)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...field.value, group.id])
                                        : field.onChange(
                                            field.value?.filter(
                                              (value) => value !== group.id
                                            )
                                          )
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal">
                                  {group.name}
                                </FormLabel>
                              </FormItem>
                            )
                          }}
                        />
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No groups available</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="params"
                render={({ field }) => (
                  <FormItem>
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <FormLabel>Parameters</FormLabel>
                        <FormDescription>
                          Define API parameters (query, header, or body)
                        </FormDescription>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          field.onChange([
                            ...field.value,
                            { name: "", location: "query" as const, data_type: null, is_required: false, validate_type: null, validate: null, default_value: null },
                          ])
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        New Param
                      </Button>
                    </div>
                    <div className="space-y-4">
                      {field.value.map((param, index) => (
                        <div
                          key={`param-${index}-${(param as { name?: string }).name ?? ""}`}
                          className="space-y-4 p-4 border rounded-lg"
                        >
                          <div className="flex gap-4 items-end">
                            <FormField
                              control={form.control}
                              name={`params.${index}.name`}
                              render={({ field: paramField }) => (
                                <FormItem className="flex-1">
                                  <FormLabel>Parameter Name</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="e.g., id, limit, token"
                                      {...paramField}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`params.${index}.location`}
                              render={({ field: locationField }) => (
                                <FormItem className="w-40">
                                  <FormLabel>Location</FormLabel>
                                  <Select
                                    onValueChange={locationField.onChange}
                                    value={locationField.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="query">Query</SelectItem>
                                      <SelectItem value="header">Header</SelectItem>
                                      <SelectItem value="body">Body</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`params.${index}.is_required`}
                              render={({ field: isRequiredField }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                                  <FormControl>
                                    <Checkbox
                                      checked={isRequiredField.value}
                                      onCheckedChange={isRequiredField.onChange}
                                    />
                                  </FormControl>
                                  <div className="space-y-1 leading-none">
                                    <FormLabel className="text-sm font-normal">
                                      Required
                                    </FormLabel>
                                  </div>
                                </FormItem>
                              )}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                field.onChange(
                                  field.value.filter((_, i) => i !== index)
                                )
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                              control={form.control}
                              name={`params.${index}.data_type`}
                              render={({ field: dataTypeField }) => (
                                <FormItem>
                                  <FormLabel>Data Type</FormLabel>
                                  <Select
                                    onValueChange={(value) => dataTypeField.onChange(value === "none" ? null : value)}
                                    value={dataTypeField.value || "none"}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select data type" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="none">None</SelectItem>
                                      <SelectItem value="string">String</SelectItem>
                                      <SelectItem value="number">Number</SelectItem>
                                      <SelectItem value="integer">Integer</SelectItem>
                                      <SelectItem value="boolean">Boolean</SelectItem>
                                      <SelectItem value="array">Array</SelectItem>
                                      <SelectItem value="object">Object</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormDescription>
                                    Expected data type for validation
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`params.${index}.validate_type`}
                              render={({ field: validateTypeField }) => (
                                <FormItem>
                                  <FormLabel>Validate Type</FormLabel>
                                  <Select
                                    onValueChange={(value) => validateTypeField.onChange(value === "none" ? null : value)}
                                    value={validateTypeField.value || "none"}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select validate type" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="none">None</SelectItem>
                                      <SelectItem value="regex">Regex</SelectItem>
                                      <SelectItem value="python">Python</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormDescription>
                                    Validation method type
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          {form.watch(`params.${index}.validate_type`) && (
                            <FormField
                              control={form.control}
                              name={`params.${index}.validate`}
                              render={({ field: validateField }) => (
                                <FormItem>
                                  <FormLabel>
                                    {form.watch(`params.${index}.validate_type`) === "regex" ? "Regex Pattern" : "Python Function Code"}
                                  </FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder={
                                        form.watch(`params.${index}.validate_type`) === "regex"
                                          ? "e.g., ^[0-9]+$"
                                          : "def validate_xxx(value):\n    return isinstance(value, int) and value > 0"
                                      }
                                      className="font-mono min-h-[100px]"
                                      {...validateField}
                                      value={validateField.value || ""}
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    {form.watch(`params.${index}.validate_type`) === "regex"
                                      ? "Regular expression pattern for validation"
                                      : "Python function code that takes 'value' parameter and returns True/False"}
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                          <FormField
                            control={form.control}
                            name={`params.${index}.default_value`}
                            render={({ field: defaultValueField }) => (
                              <FormItem>
                                <FormLabel>Default Value</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Default value for this parameter"
                                    {...defaultValueField}
                                    value={defaultValueField.value || ""}
                                    onChange={(e) =>
                                      defaultValueField.onChange(
                                        e.target.value || null
                                      )
                                    }
                                  />
                                </FormControl>
                                <FormDescription>
                                  Default value to use in debug if not provided
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      ))}
                      {field.value.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No parameters defined. Click "New Param" to add one.
                        </p>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TabsContent>

            <TabsContent value="content" className="space-y-4">
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {executeEngine === "SQL" ? "SQL (Jinja2)" : "Python Script"}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={
                          executeEngine === "SQL"
                            ? 'SELECT * FROM users WHERE id = {{ params.id }}'
                            : 'def execute(params):\n    return {"result": "success"}'
                        }
                        className="font-mono min-h-[400px]"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormDescription>
                      {executeEngine === "SQL"
                        ? "SQL query with Jinja2 template syntax for parameters"
                        : "Python script with execute(params) function"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TabsContent>

            <TabsContent value="debug" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Debug API</CardTitle>
                  <CardDescription>
                    Test your API with sample parameters (JSON or form)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Tabs
                    value={debugInputMode}
                    onValueChange={(v) => setDebugInputMode(v as "json" | "form")}
                    className="w-full"
                  >
                    <TabsList className="grid w-full max-w-[200px] grid-cols-2">
                      <TabsTrigger value="form">Form</TabsTrigger>
                      <TabsTrigger value="json">JSON</TabsTrigger>
                    </TabsList>
                    <TabsContent value="json" className="mt-4 space-y-4">
                      <div>
                        <label
                          htmlFor="debug-params-json"
                          className="text-sm font-medium"
                        >
                          Parameters (JSON)
                        </label>
                        <Textarea
                          id="debug-params-json"
                          value={debugParams}
                          onChange={(e) => setDebugParams(e.target.value)}
                          className="mt-1 font-mono min-h-[150px]"
                          placeholder='{"id": 1, "name": "test"}'
                        />
                      </div>
                    </TabsContent>
                    <TabsContent value="form" className="mt-4 space-y-4">
                      {(() => {
                        const paramsDef = form.watch("params") ?? []
                        const withName = paramsDef.filter(
                          (p) => typeof p?.name === "string" && p.name.trim() !== ""
                        )
                        if (withName.length === 0) {
                          return (
                            <p className="text-sm text-muted-foreground">
                              No parameters defined. Add parameters in Basic Info
                              → Parameters, then use this form to fill values.
                            </p>
                          )
                        }
                        return (
                          <div className="space-y-4">
                            {withName.map((p, idx) => {
                              const name = (p?.name ?? "").trim()
                              const dataType = (p?.data_type ?? "string").toLowerCase()
                              const isRequired = Boolean(p?.is_required)
                              const location = p?.location ?? "query"
                              return (
                                <div
                                  key={`${idx}-${name}`}
                                  className="space-y-2"
                                >
                                  <label
                                    htmlFor={`debug-param-${name}`}
                                    className="text-sm font-medium"
                                  >
                                    {name}
                                    {isRequired && (
                                      <span className="text-destructive ml-1">
                                        *
                                      </span>
                                    )}
                                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                                      ({location})
                                    </span>
                                  </label>
                                  {dataType === "boolean" ? (
                                    <div className="flex items-center gap-2">
                                      <Checkbox
                                        id={`debug-param-${name}`}
                                        checked={
                                          (debugFormValues[name] ??
                                            p?.default_value ??
                                            "") === "true" ||
                                          (debugFormValues[name] ??
                                            p?.default_value ??
                                            "") === "1"
                                        }
                                        onCheckedChange={(checked) =>
                                          setDebugFormValues((prev) => ({
                                            ...prev,
                                            [name]: checked ? "true" : "false",
                                          }))
                                        }
                                      />
                                      <span className="text-sm text-muted-foreground">
                                        {(debugFormValues[name] ??
                                          p?.default_value ??
                                          "") === "true" ||
                                        (debugFormValues[name] ??
                                          p?.default_value ??
                                          "") === "1"
                                          ? "true"
                                          : "false"}
                                      </span>
                                    </div>
                                  ) : dataType === "array" ||
                                    dataType === "object" ? (
                                    <Textarea
                                      id={`debug-param-${name}`}
                                      placeholder={
                                        dataType === "array"
                                          ? '[1, 2, 3] or "a, b, c"'
                                          : '{"key": "value"}'
                                      }
                                      className="font-mono min-h-[80px]"
                                      value={
                                        debugFormValues[name] ??
                                        p?.default_value ??
                                        ""
                                      }
                                      onChange={(e) =>
                                        setDebugFormValues((prev) => ({
                                          ...prev,
                                          [name]: e.target.value,
                                        }))
                                      }
                                    />
                                  ) : (
                                    <Input
                                      id={`debug-param-${name}`}
                                      type={
                                        dataType === "number" ||
                                        dataType === "integer"
                                          ? "number"
                                          : "text"
                                      }
                                      placeholder={
                                        isRequired
                                          ? `Required (${dataType})`
                                          : `Optional (${dataType})`
                                      }
                                      value={
                                        debugFormValues[name] ??
                                        p?.default_value ??
                                        ""
                                      }
                                      onChange={(e) =>
                                        setDebugFormValues((prev) => ({
                                          ...prev,
                                          [name]: e.target.value,
                                        }))
                                      }
                                    />
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </TabsContent>
                  </Tabs>
                  <Button
                    type="button"
                    onClick={handleDebug}
                    disabled={debugLoading || !form.watch("content")}
                  >
                    {debugLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Run Debug
                      </>
                    )}
                  </Button>
                  {debugResult && (
                    <div>
                      <label
                        htmlFor="debug-result-pre"
                        className="text-sm font-medium"
                      >
                        Result
                      </label>
                      <pre
                        id="debug-result-pre"
                        className="mt-2 p-4 bg-muted rounded-md overflow-auto max-h-[400px]"
                      >
                        {JSON.stringify(debugResult, null, 2)}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex gap-4">
            <LoadingButton
              type="submit"
              loading={updateMutation.isPending}
            >
              Update API
            </LoadingButton>
          </div>
        </form>
      </Form>
    </div>
  )
}
