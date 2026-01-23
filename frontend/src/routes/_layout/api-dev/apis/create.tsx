import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Loader2, Play, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

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
  type ApiAssignmentCreate,
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
  const [debugParams, setDebugParams] = useState("{}")
  const [debugResult, setDebugResult] = useState<unknown>(null)
  const [debugLoading, setDebugLoading] = useState(false)

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
      sort_order: 0,
      content: "",
      group_ids: [],
      params: [],
    },
  })

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

  const handleDebug = async () => {
    const values = form.getValues()
    if (!values.content) {
      showErrorToast("Please enter content to debug")
      return
    }

    setDebugLoading(true)
    setDebugResult(null)

    try {
      let paramsObj = {}
      try {
        paramsObj = JSON.parse(debugParams)
      } catch {
        showErrorToast("Invalid JSON in params")
        setDebugLoading(false)
        return
      }

      const result = await ApiAssignmentsService.debug({
        content: values.content,
        execute_engine: values.execute_engine,
        datasource_id: values.datasource_id || undefined,
        params: paramsObj,
      })

      setDebugResult(result)
      if (result.error) {
        showErrorToast(result.error)
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
      datasource_id: values.datasource_id || null,
      description: values.description || null,
      sort_order: values.sort_order,
      content: values.content || null,
      group_ids: values.group_ids,
      params: values.params.length > 0 ? values.params : undefined,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Create API</h1>
        <p className="text-muted-foreground">Create a new API assignment</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs defaultValue="basic" className="w-full">
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
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select module" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {modulesData?.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
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
                        <Input placeholder="users or users/:id" {...field} />
                      </FormControl>
                      <FormDescription>
                        Path within module (e.g., "users" or "users/:id")
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
                        defaultValue={field.value}
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
                        defaultValue={field.value}
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
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>DataSource</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                        value={field.value || "none"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select datasource" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {datasourcesData?.data && datasourcesData.data.length > 0 ? (
                            datasourcesData.data.map((ds) => (
                              <SelectItem key={ds.id} value={String(ds.id)}>
                                {ds.name}
                              </SelectItem>
                            ))
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
                  )}
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
                            { name: "", location: "query" as const, data_type: null, is_required: false, validate_type: null, validate: null },
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
                          key={index}
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
                            ? "SELECT * FROM users WHERE id = :id"
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
                    Test your API with sample parameters
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label htmlFor="debug-params" className="text-sm font-medium">Parameters (JSON)</label>
                    <Textarea
                      id="debug-params"
                      value={debugParams}
                      onChange={(e) => setDebugParams(e.target.value)}
                      className="font-mono min-h-[150px]"
                      placeholder='{"id": 1, "name": "test"}'
                    />
                  </div>
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
                      <p className="text-sm font-medium mb-2">Result</p>
                      <pre className="mt-2 p-4 bg-muted rounded-md overflow-auto max-h-[400px]">
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
              loading={createMutation.isPending}
            >
              Create API
            </LoadingButton>
          </div>
        </form>
      </Form>
    </div>
  )
}
