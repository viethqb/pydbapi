import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { useEffect, useMemo, useState, useCallback } from "react"
import { ArrowLeft, ChevronDown, Search, X } from "lucide-react"

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
import { Textarea } from "@/components/ui/textarea"
import { LoadingButton } from "@/components/ui/loading-button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ClientsService,
  type AppClientUpdate,
} from "@/services/clients"
import { GroupsService } from "@/services/groups"
import { ApiAssignmentsService } from "@/services/api-assignments"
import { ModulesService } from "@/services/modules"
import type { ApiAssignmentPublic } from "@/services/api-assignments"
import type { ApiModulePublic } from "@/services/modules"
import useCustomToast from "@/hooks/useCustomToast"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(512).optional().nullable(),
  rate_limit_per_minute: z
    .union([z.number().int().positive(), z.null(), z.literal("")])
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v)),
  max_concurrent: z
    .union([z.number().int().positive(), z.null(), z.literal("")])
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v)),
  is_active: z.boolean().default(true),
  group_ids: z.array(z.string()).default([]),
  api_assignment_ids: z.array(z.string()).default([]),
})

type FormValues = z.infer<typeof formSchema>

export const Route = createFileRoute("/_layout/system/clients/$id/edit")({
  component: EditClientPage,
  head: () => ({
    meta: [
      {
        title: "Edit Client - System",
      },
    ],
  }),
})

function EditClientPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: () => ClientsService.get(id),
  })

  const { data: groupsData } = useQuery({
    queryKey: ["groups-simple"],
    queryFn: () => GroupsService.list({ page: 1, page_size: 100 }),
  })

  const { data: apisData } = useQuery({
    queryKey: ["apis-published-for-client"],
    queryFn: () => ApiAssignmentsService.list({ is_published: true, page: 1, page_size: 100 }),
  })

  const { data: modulesData } = useQuery({
    queryKey: ["modules-simple"],
    queryFn: () => ModulesService.list({ page: 1, page_size: 100 }),
  })

  const [groupSearch, setGroupSearch] = useState("")
  const [apiSearch, setApiSearch] = useState("")

  const modulesMap = useMemo(() => {
    const m: Record<string, ApiModulePublic> = {}
    for (const mod of modulesData?.data ?? []) m[mod.id] = mod
    return m
  }, [modulesData?.data])

  const getApiFullPath = useCallback(
    (api: ApiAssignmentPublic): string => {
      const mod = modulesMap[api.module_id]
      if (!mod) return `/${api.path || ""}`.replace(/\/+/g, "/")
      const p = (api.path || "").replace(/^\//, "")
      const raw = (mod.path_prefix || "/").replace(/^\/+|\/+$/g, "")
      if (!raw) return `/${p}`.replace(/\/+/g, "/")
      return `/${raw}/${p}`.replace(/\/+/g, "/")
    },
    [modulesMap],
  )

  const filteredGroups = useMemo(() => {
    const list = groupsData?.data ?? []
    const q = groupSearch.trim().toLowerCase()
    if (!q) return list
    return list.filter((g) => g.name.toLowerCase().includes(q))
  }, [groupsData?.data, groupSearch])

  const filteredApis = useMemo(() => {
    const list = apisData?.data ?? []
    const q = apiSearch.trim().toLowerCase()
    if (!q) return list
    return list.filter((api) => {
      const full = getApiFullPath(api)
      const s = `${api.name} ${api.http_method} ${api.path} ${full}`.toLowerCase()
      return s.includes(q)
    })
  }, [apisData?.data, apiSearch, getApiFullPath])

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: null,
      rate_limit_per_minute: null,
      max_concurrent: null,
      is_active: true,
      group_ids: [],
      api_assignment_ids: [],
    },
  })

  useEffect(() => {
    if (client) {
      form.reset({
        name: client.name,
        description: client.description,
        rate_limit_per_minute: (client as { rate_limit_per_minute?: number | null }).rate_limit_per_minute ?? null,
        max_concurrent: (client as { max_concurrent?: number | null }).max_concurrent ?? null,
        is_active: client.is_active,
        group_ids: client.group_ids ?? [],
        api_assignment_ids: client.api_assignment_ids ?? [],
      })
    }
  }, [client, form])

  const updateMutation = useMutation({
    mutationFn: (data: AppClientUpdate) => ClientsService.update(data),
    onSuccess: () => {
      showSuccessToast("Client updated successfully")
      queryClient.invalidateQueries({ queryKey: ["clients"] })
      queryClient.invalidateQueries({ queryKey: ["client", id] })
      navigate({ to: "/system/clients/$id", params: { id } })
    },
    onError: (error: Error) => {
      showErrorToast(error.message || "Failed to update client")
    },
  })

  const onSubmit = (values: FormValues) => {
    updateMutation.mutate({
      id: id,
      name: values.name,
      description: values.description || null,
      rate_limit_per_minute:
        values.rate_limit_per_minute === "" || values.rate_limit_per_minute == null
          ? null
          : Number(values.rate_limit_per_minute),
      max_concurrent:
        values.max_concurrent === "" || values.max_concurrent == null
          ? null
          : Number(values.max_concurrent),
      is_active: values.is_active,
      group_ids: values.group_ids.length > 0 ? values.group_ids : [],
      api_assignment_ids: values.api_assignment_ids.length > 0 ? values.api_assignment_ids : [],
    })
  }

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">Loading...</div>
    )
  }

  if (!client) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Client not found</p>
        <Link to="/system/clients">
          <Button variant="outline" className="mt-4">
            Back to List
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <Link to="/system/clients/$id" params={{ id }}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Client</h1>
          <p className="text-muted-foreground mt-1">Update client settings and permissions</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Client Configuration</CardTitle>
              <CardDescription>Configure the client settings</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableHead className="w-[180px]">Name *</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input placeholder="Client name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Client ID</TableHead>
                    <TableCell>
                      <Input value={client.client_id} readOnly className="font-mono bg-muted" />
                      <FormDescription className="mt-1">
                        Client ID cannot be changed after creation
                      </FormDescription>
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
                    <TableHead className="w-[180px]">Rate Limit (req/min)</TableHead>
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
                            <FormDescription>
                              Max requests per minute. Empty = no limit.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Max Concurrent</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="max_concurrent"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                placeholder="Use global default"
                                {...field}
                                value={field.value === null || field.value === undefined ? "" : field.value}
                                onChange={(e) => {
                                  const v = e.target.value
                                  field.onChange(v === "" ? null : Number(v))
                                }}
                              />
                            </FormControl>
                            <FormDescription>
                              Max concurrent requests. Empty = use global default.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Active</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="is_active"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Enable this client</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">API Groups</TableHead>
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
                                <DropdownMenuContent className="min-w-[260px] max-h-[320px] overflow-hidden flex flex-col">
                                  <div
                                    className="p-2 border-b shrink-0"
                                    onPointerDown={(e) => e.stopPropagation()}
                                  >
                                    <div className="relative">
                                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                      <Input
                                        placeholder="Search groups..."
                                        value={groupSearch}
                                        onChange={(e) => setGroupSearch(e.target.value)}
                                        onKeyDown={(e) => e.stopPropagation()}
                                        className="pl-7 h-8"
                                      />
                                    </div>
                                  </div>
                                  <div className="overflow-auto max-h-[240px]">
                                    {filteredGroups.length > 0 ? (
                                      filteredGroups.map((group) => (
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
                                      <div className="py-6 text-center text-sm text-muted-foreground">
                                        {groupSearch.trim()
                                          ? "No groups match search"
                                          : "No groups available"}
                                      </div>
                                    )}
                                  </div>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </FormControl>
                            <FormDescription>
                              Groups that grant API access to this client
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Direct APIs</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="api_assignment_ids"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <div className="flex min-h-[40px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-pointer">
                                    <div className="flex flex-wrap gap-1 flex-1">
                                      {field.value && field.value.length > 0 ? (
                                        field.value.map((apiId) => {
                                          const api = apisData?.data?.find((a) => a.id === apiId)
                                          if (!api) return null
                                          const fullPath = getApiFullPath(api)
                                          return (
                                            <Badge
                                              key={api.id}
                                              variant="secondary"
                                              className="mr-1 max-w-[200px] truncate"
                                              title={`${api.http_method} ${fullPath}`}
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                field.onChange(field.value.filter((id) => id !== apiId))
                                              }}
                                            >
                                              {api.http_method} {fullPath}
                                              <button
                                                type="button"
                                                className="ml-1 rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                                onMouseDown={(e) => {
                                                  e.preventDefault()
                                                  e.stopPropagation()
                                                }}
                                                onClick={(e) => {
                                                  e.preventDefault()
                                                  e.stopPropagation()
                                                  field.onChange(field.value.filter((id) => id !== apiId))
                                                }}
                                              >
                                                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                              </button>
                                            </Badge>
                                          )
                                        })
                                      ) : (
                                        <span className="text-muted-foreground">Select direct APIs...</span>
                                      )}
                                    </div>
                                    <ChevronDown className="h-4 w-4 opacity-50 ml-2 shrink-0" />
                                  </div>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="min-w-[340px] max-w-[420px] max-h-[320px] overflow-hidden flex flex-col">
                                  <div
                                    className="p-2 border-b shrink-0"
                                    onPointerDown={(e) => e.stopPropagation()}
                                  >
                                    <div className="relative">
                                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                      <Input
                                        placeholder="Search by name, path, method..."
                                        value={apiSearch}
                                        onChange={(e) => setApiSearch(e.target.value)}
                                        onKeyDown={(e) => e.stopPropagation()}
                                        className="pl-7 h-8"
                                      />
                                    </div>
                                  </div>
                                  <div className="overflow-auto max-h-[240px]">
                                    {filteredApis.length > 0 ? (
                                      filteredApis.map((api) => {
                                        const fullPath = getApiFullPath(api)
                                        return (
                                          <DropdownMenuItem
                                            key={api.id}
                                            onSelect={(e) => {
                                              e.preventDefault()
                                              const currentValue = field.value || []
                                              if (currentValue.includes(api.id)) {
                                                field.onChange(currentValue.filter((id) => id !== api.id))
                                              } else {
                                                field.onChange([...currentValue, api.id])
                                              }
                                            }}
                                          >
                                            <div className="flex items-center gap-2 w-full min-w-0">
                                              <input
                                                type="checkbox"
                                                checked={field.value?.includes(api.id) || false}
                                                onChange={() => {}}
                                                className="h-4 w-4 rounded border-gray-300 shrink-0"
                                              />
                                              <span className="truncate font-mono text-xs" title={`${api.name} — ${api.http_method} ${fullPath}`}>
                                                {api.http_method} {fullPath}
                                              </span>
                                            </div>
                                          </DropdownMenuItem>
                                        )
                                      })
                                    ) : (
                                      <div className="py-6 text-center text-sm text-muted-foreground">
                                        {apiSearch.trim()
                                          ? "No APIs match search"
                                          : "No published APIs"}
                                      </div>
                                    )}
                                  </div>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </FormControl>
                            <FormDescription>
                              APIs accessible directly (outside groups)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-4">
            <LoadingButton
              type="submit"
              loading={updateMutation.isPending}
            >
              Update Client
            </LoadingButton>
          </div>
        </form>
      </Form>
    </div>
  )
}
