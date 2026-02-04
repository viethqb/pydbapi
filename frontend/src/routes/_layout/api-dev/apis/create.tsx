import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Braces, Loader2, Play, Plus, Trash2, X, ChevronDown } from "lucide-react"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ApiAssignmentsService,
  type ApiAssignmentCreate,
} from "@/services/api-assignments"
import { ModulesService } from "@/services/modules"
import { MacroDefsService } from "@/services/macro-defs"
import { DataSourceService } from "@/services/datasource"
import { GroupsService } from "@/services/groups"
import useCustomToast from "@/hooks/useCustomToast"
import { Checkbox } from "@/components/ui/checkbox"
import ApiContentEditor from "@/components/ApiDev/ApiContentEditor"
import ApiContentExamples from "@/components/ApiDev/ApiContentExamples"
import ParamsExample from "@/components/ApiDev/ParamsExample"
import {
  RESULT_TRANSFORM_PLACEHOLDER,
  SCRIPT_CONTENT_PLACEHOLDER,
  SQL_CONTENT_PLACEHOLDER,
} from "@/components/ApiDev/apiContentPlaceholders"
import ResultTransformExamples from "@/components/ApiDev/ResultTransformExamples"
import SqlStatementsEditor from "@/components/ApiDev/SqlStatementsEditor"

const paramSchema = z.object({
  name: z.string().min(1, "Parameter name is required"),
  location: z.enum(["query", "header", "body"]),
  data_type: z.string().optional().nullable(),
  is_required: z.boolean().default(false),
  default_value: z.string().optional().nullable(),
  description: z.string().max(512).optional().nullable(),
})

const paramValidateSchema = z.object({
  name: z.string().min(1, "Parameter name is required"),
  validation_script: z.string().optional().nullable(),
  message_when_fail: z.string().optional().nullable(),
})

const formSchema = z.object({
  module_id: z.string().min(1, "Module is required"),
  name: z.string().min(1, "Name is required").max(255),
  path: z.string().min(1, "Path is required").max(255),
  http_method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  execute_engine: z.enum(["SQL", "SCRIPT"]),
  datasource_id: z
    .string()
    .nullable()
    .refine((v) => v != null && v !== "" && v !== "none", {
      message: "DataSource is required",
    }),
  description: z.string().max(512).optional().nullable(),
  access_type: z.enum(["public", "private"]).default("private"),
  rate_limit_per_minute: z
    .union([z.number().int().positive(), z.null(), z.literal("")])
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v)),
  close_connection_after_execute: z.boolean().default(false),
  content: z.string().optional().nullable(),
  result_transform: z.string().optional().nullable(),
  group_ids: z.array(z.string()).default([]),
  params: z.array(paramSchema).default([]),
  param_validates: z.array(paramValidateSchema).default([]),
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

const searchSchema = z.object({
  module_id: z.string().optional().catch(undefined),
})

export const Route = createFileRoute("/_layout/api-dev/apis/create")({
  component: ApiCreate,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      {
        title: "Create API",
      },
    ],
  }),
})

function ApiCreate() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const module_id = search?.module_id
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [mainTab, setMainTab] = useState("basic")
  const [debugParams, setDebugParams] = useState("{}")
  const [debugInputMode, setDebugInputMode] = useState<"json" | "form">("form")
  const [debugFormValues, setDebugFormValues] = useState<Record<string, string>>({})
  const [debugResult, setDebugResult] = useState<unknown>(null)
  const [debugLoading, setDebugLoading] = useState(false)
  const paramsRef = useRef<string>("")

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    defaultValues: {
      module_id: module_id || "",
      name: "",
      path: "",
      http_method: "GET",
      execute_engine: "SQL",
      datasource_id: null,
      description: null,
      access_type: "private",
      rate_limit_per_minute: null,
      close_connection_after_execute: false,
      content: "",
      group_ids: [],
      params: [],
      result_transform: "",
      param_validates: [],
    },
  })

  const executeEngine = form.watch("execute_engine")
  const moduleId = form.watch("module_id")
  const paramNamesForContentSuggestions = (form.watch("params") ?? [])
    .map((p) => (typeof p?.name === "string" ? p.name.trim() : ""))
    .filter(Boolean)

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

  const { data: macroDefsData } = useQuery({
    queryKey: ["macro-defs-in-scope", moduleId ?? "all"],
    queryFn: () => MacroDefsService.listSimple(moduleId || undefined),
    enabled: true,
  })
  const macroDefsForEditor = macroDefsData ?? []

  const createMutation = useMutation({
    mutationFn: (data: ApiAssignmentCreate) => ApiAssignmentsService.create(data),
    onSuccess: (data) => {
      showSuccessToast("API created successfully")
      navigate({ to: "/api-dev/apis/$id", params: { id: data.id } })
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
      const raw = debugFormValues[name] ?? p?.default_value ?? ""
      const v = parseFormValueToParam(raw, p.data_type ?? undefined)
      if (v !== null && v !== "") out[name] = v
    }
    return out
  }

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

    setDebugFormValues((prev) => ({ ...newFormValues, ...prev }))

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

  useEffect(() => {
    const subscription = form.watch((_value, { name }) => {
      if (name === "params") {
        fillDefaultValues()
      }
    })
    return () => subscription.unsubscribe()
  }, [form, fillDefaultValues])

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
        content: values.content,
        execute_engine: values.execute_engine,
        datasource_id: values.datasource_id || undefined,
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
    createMutation.mutate({
      module_id: values.module_id,
      name: values.name,
      path: values.path,
      http_method: values.http_method,
      execute_engine: values.execute_engine,
      datasource_id: values.datasource_id ?? null,
      description: values.description || null,
      access_type: values.access_type,
      rate_limit_per_minute:
        values.rate_limit_per_minute === "" || values.rate_limit_per_minute == null
          ? null
          : Number(values.rate_limit_per_minute),
      close_connection_after_execute: values.close_connection_after_execute ?? false,
      content: values.content || null,
      result_transform: values.result_transform || null,
      group_ids: values.group_ids,
      params: values.params.length > 0 ? values.params : undefined,
      param_validates: values.param_validates.length > 0 ? values.param_validates : undefined,
    })
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create API</h1>
        <p className="text-muted-foreground mt-1">Create a new API assignment</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>API Configuration</CardTitle>
              <CardDescription>Configure the basic settings for your API</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs
                value={mainTab}
                onValueChange={(v) => {
                  setMainTab(v)
                  if (v === "debug") fillDefaultValues(true)
                }}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">Basic Info</TabsTrigger>
                  <TabsTrigger value="content">Content</TabsTrigger>
                  <TabsTrigger value="debug">Debug</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-6 mt-6">
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableHead className="w-[180px]">Module *</TableHead>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name="module_id"
                            render={({ field }) => (
                              <FormItem>
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
                                    {Array.isArray(modulesData) && modulesData.map((m) => (
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
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead className="w-[180px]">Name *</TableHead>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input placeholder="My API" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead className="w-[180px]">Path *</TableHead>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name="path"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input placeholder="users or users/{id}" {...field} />
                                </FormControl>
                                <FormDescription className="mt-1">
                                  {`Path within module (e.g., "users" or "users/{id}")`}
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead className="w-[180px]">HTTP Method *</TableHead>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name="http_method"
                            render={({ field }) => (
                              <FormItem>
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
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead className="w-[180px]">Access Type *</TableHead>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name="access_type"
                            render={({ field }) => (
                              <FormItem>
                                <Select
                                  onValueChange={(v) => field.onChange(v)}
                                  value={field.value || "private"}
                                  key={field.value || "private"}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select access type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="public">Public (No auth required)</SelectItem>
                                    <SelectItem value="private">Private (Token required)</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormDescription className="mt-1">
                                  Public APIs can be accessed without authentication. Private APIs require a token from /token/generate.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead className="w-[180px]">Rate limit (req/min)</TableHead>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name="rate_limit_per_minute"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder="No limit"
                                    {...field}
                                    value={field.value === null || field.value === undefined ? "" : field.value}
                                    onChange={(e) => {
                                      const v = e.target.value
                                      field.onChange(v === "" ? null : Number(v))
                                    }}
                                  />
                                </FormControl>
                                <FormDescription className="mt-1">
                                  Max requests per minute for this API. Empty = no limit (call freely).
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead className="w-[180px]">Close connection after execute</TableHead>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name="close_connection_after_execute"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Close DB connection after each request (e.g. StarRocks impersonation)</FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead className="w-[180px]">Description</TableHead>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Textarea
                                    placeholder="Optional description"
                                    {...field}
                                    value={field.value || ""}
                                    onChange={(e) => field.onChange(e.target.value || null)}
                                    className="min-h-[80px]"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead className="w-[180px]">Groups</TableHead>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name="group_ids"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <div className="flex min-h-[40px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-pointer">
                                        <div className="flex flex-wrap gap-1 flex-1">
                                          {field.value && field.value.length > 0 ? (
                                            field.value.map((groupId) => {
                                              const group = groupsData?.data?.find((g) => g.id === groupId)
                                              if (!group) return null
                                              return (
                                                <Badge
                                                  key={group.id}
                                                  variant="secondary"
                                                  className="mr-1"
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    field.onChange(field.value.filter((id) => id !== groupId))
                                                  }}
                                                >
                                                  {group.name}
                                                  <button
                                                    type="button"
                                                    className="ml-1 rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                                    onKeyDown={(e) => {
                                                      if (e.key === "Enter") {
                                                        field.onChange(field.value.filter((id) => id !== groupId))
                                                      }
                                                    }}
                                                    onMouseDown={(e) => {
                                                      e.preventDefault()
                                                      e.stopPropagation()
                                                    }}
                                                    onClick={(e) => {
                                                      e.preventDefault()
                                                      e.stopPropagation()
                                                      field.onChange(field.value.filter((id) => id !== groupId))
                                                    }}
                                                  >
                                                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                                  </button>
                                                </Badge>
                                              )
                                            })
                                          ) : (
                                            <span className="text-muted-foreground">Select groups...</span>
                                          )}
                                        </div>
                                        <ChevronDown className="h-4 w-4 opacity-50 ml-2 shrink-0" />
                                      </div>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-[300px] overflow-auto">
                                      {Array.isArray(groupsData?.data) && groupsData.data.length > 0 ? (
                                        groupsData.data.map((group) => (
                                          <DropdownMenuItem
                                            key={group.id}
                                            onSelect={(e) => {
                                              e.preventDefault()
                                              const currentValue = field.value || []
                                              if (currentValue.includes(group.id)) {
                                                field.onChange(currentValue.filter((id) => id !== group.id))
                                              } else {
                                                field.onChange([...currentValue, group.id])
                                              }
                                            }}
                                          >
                                            <div className="flex items-center gap-2 w-full">
                                              <input
                                                type="checkbox"
                                                checked={field.value?.includes(group.id) || false}
                                                onChange={() => {}}
                                                className="h-4 w-4 rounded border-gray-300"
                                              />
                                              <span>{group.name}</span>
                                            </div>
                                          </DropdownMenuItem>
                                        ))
                                      ) : (
                                        <DropdownMenuItem disabled>No groups available</DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>

                  <div className="mt-6 border-t pt-6">
                    <FormField
                      control={form.control}
                      name="params"
                      render={({ field }) => (
                        <FormItem>
                            <div className="mb-4 flex items-center justify-between">
                            <div>
                              <FormLabel>Parameters</FormLabel>
                              <FormDescription>
                                Define API parameters (query, header, body). Set data type for validation.
                              </FormDescription>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                field.onChange([
                                  ...field.value,
                                  { name: "", location: "query" as const, data_type: null, is_required: false, default_value: null, description: null },
                                ])
                              }}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Add Parameter
                            </Button>
                          </div>
                          <ParamsExample />
                          {field.value && field.value.length > 0 ? (
                            <div className="rounded-md border overflow-x-auto">
                              <Table>
                                <TableBody>
                                  <TableRow>
                                    <TableHead className="w-[160px]">Name</TableHead>
                                    <TableHead className="w-[100px]">Location</TableHead>
                                    <TableHead className="w-[110px]">Data Type</TableHead>
                                    <TableHead className="w-[80px]">Required</TableHead>
                                    <TableHead className="w-[120px]">Default</TableHead>
                                    <TableHead className="min-w-[160px]">Description</TableHead>
                                    <TableHead className="w-[80px]">Actions</TableHead>
                                  </TableRow>
                                  {field.value.map((param, index) => {
                                    const paramName = (param as { name?: string }).name || ""
                                    return (
                                    <TableRow key={`param-${index}-${paramName}`}>
                                      <TableCell>
                                        <FormField
                                          control={form.control}
                                          name={`params.${index}.name`}
                                          render={({ field: paramField }) => (
                                            <FormItem>
                                              <FormControl>
                                                <Input
                                                  placeholder="e.g., id, limit"
                                                  {...paramField}
                                                  className="h-9"
                                                />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <FormField
                                          control={form.control}
                                          name={`params.${index}.location`}
                                          render={({ field: locationField }) => (
                                            <FormItem>
                                              <Select
                                                onValueChange={locationField.onChange}
                                                value={locationField.value}
                                              >
                                                <FormControl>
                                                  <SelectTrigger className="h-9">
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
                                      </TableCell>
                                      <TableCell>
                                        <FormField
                                          control={form.control}
                                          name={`params.${index}.data_type`}
                                          render={({ field: dataTypeField }) => (
                                            <FormItem>
                                              <Select
                                                onValueChange={(value) => dataTypeField.onChange(value === "none" ? null : value)}
                                                value={dataTypeField.value || "none"}
                                              >
                                                <FormControl>
                                                  <SelectTrigger className="h-9">
                                                    <SelectValue />
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
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <FormField
                                          control={form.control}
                                          name={`params.${index}.is_required`}
                                          render={({ field: isRequiredField }) => (
                                            <FormItem>
                                              <FormControl>
                                                <Checkbox
                                                  checked={isRequiredField.value}
                                                  onCheckedChange={isRequiredField.onChange}
                                                />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <FormField
                                          control={form.control}
                                          name={`params.${index}.default_value`}
                                          render={({ field: defaultValueField }) => (
                                            <FormItem>
                                              <FormControl>
                                                <Input
                                                  placeholder="Default"
                                                  {...defaultValueField}
                                                  value={defaultValueField.value || ""}
                                                  onChange={(e) =>
                                                    defaultValueField.onChange(
                                                      e.target.value || null
                                                    )
                                                  }
                                                  className="h-9"
                                                />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <FormField
                                          control={form.control}
                                          name={`params.${index}.description`}
                                          render={({ field: descField }) => (
                                            <FormItem>
                                              <FormControl>
                                                <Input
                                                  placeholder="Mô tả ý nghĩa param"
                                                  {...descField}
                                                  value={descField.value || ""}
                                                  onChange={(e) =>
                                                    descField.onChange(e.target.value || null)
                                                  }
                                                  className="h-9"
                                                />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                      </TableCell>
                                      <TableCell>
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
                                      </TableCell>
                                    </TableRow>
                                    )
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground text-center py-4 border rounded-md">
                              No parameters defined. Click "Add Parameter" to add one.
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="content" className="space-y-4">
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableHead className="w-[180px]">Execute Engine *</TableHead>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name="execute_engine"
                            render={({ field }) => (
                              <FormItem>
                                <Select
                                  onValueChange={(value) => {
                                    field.onChange(value)
                                    if (value === "SCRIPT") {
                                      const content = form.getValues("content")
                                      if (!content?.trim()) {
                                        form.setValue("content", SCRIPT_CONTENT_PLACEHOLDER)
                                      }
                                    }
                                  }}
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
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead className="w-[180px]">Data Source *</TableHead>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name="datasource_id"
                            render={({ field }) => {
                              const fieldValue = field.value ? String(field.value) : "none"
                              return (
                                <FormItem>
                                  <Select
                                    onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                                    value={fieldValue}
                                    key={fieldValue}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select datasource (required)" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="none">— Select datasource —</SelectItem>
                                      {Array.isArray(datasourcesData?.data) && datasourcesData.data.length > 0 ? (
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
                                  <FormDescription className="mt-1">
                                    Required. Select the database connection for this API.
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {executeEngine === "SQL" ? "SQL (Jinja2)" : "Python Script"}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {executeEngine === "SQL"
                          ? "SQL query with Jinja2 template syntax for parameters"
                          : "Python script with execute(params) function"}
                      </p>
                    </div>
                    <ApiContentExamples executeEngine={executeEngine} />
                    <FormField
                      control={form.control}
                      name="content"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            {executeEngine === "SQL" ? (
                              <SqlStatementsEditor
                                value={field.value || ""}
                                onChange={(next) => field.onChange(next)}
                                onBlur={field.onBlur}
                                placeholder={SQL_CONTENT_PLACEHOLDER}
                                paramNames={paramNamesForContentSuggestions}
                                macroDefs={macroDefsForEditor}
                              />
                            ) : (
                              <ApiContentEditor
                                executeEngine={executeEngine}
                                value={field.value || ""}
                                onChange={(next) => field.onChange(next)}
                                onBlur={field.onBlur}
                                autoHeight
                                minHeight={260}
                                maxHeight={720}
                                placeholder={SCRIPT_CONTENT_PLACEHOLDER}
                                paramNames={paramNamesForContentSuggestions}
                                macroDefs={macroDefsForEditor}
                              />
                            )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="border-t pt-6 mt-6">
                      <div className="mb-2">
                        <h3 className="text-lg font-semibold">Result transform (Python)</h3>
                        <p className="text-sm text-muted-foreground">
                          Python script to transform the raw executor result before returning
                        </p>
                      </div>
                      <ResultTransformExamples />
                      <FormField
                        control={form.control}
                        name="result_transform"
                        render={({ field }) => (
                          <FormItem className="mt-4">
                            <FormControl>
                              <ApiContentEditor
                                executeEngine="SCRIPT"
                                value={field.value || ""}
                                onChange={(next) => field.onChange(next)}
                                onBlur={field.onBlur}
                                autoHeight
                                minHeight={260}
                                maxHeight={720}
                                placeholder={RESULT_TRANSFORM_PLACEHOLDER}
                                paramNames={[]}
                                macroDefs={macroDefsForEditor}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="debug" className="space-y-4">
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
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label
                            htmlFor="debug-params-json"
                            className="text-sm font-medium"
                          >
                            Parameters (JSON)
                          </label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              try {
                                const parsed = JSON.parse(debugParams || "{}")
                                setDebugParams(JSON.stringify(parsed, null, 2))
                                showSuccessToast("JSON formatted")
                              } catch {
                                showErrorToast("Invalid JSON")
                              }
                            }}
                          >
                            <Braces className="mr-2 h-4 w-4" />
                            Format
                          </Button>
                        </div>
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
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="flex gap-4 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: "/api-dev/apis" })}
            >
              Cancel
            </Button>
            <LoadingButton
              type="submit"
              loading={createMutation.isPending}
              size="lg"
            >
              Create API
            </LoadingButton>
          </div>
        </form>
      </Form>
    </div>
  )
}
