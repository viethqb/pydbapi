import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, ChevronDown, Search, X } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ClientsService,
  type AppClientCreate,
} from "@/services/clients"
import { GroupsService } from "@/services/groups"
import { ApiAssignmentsService } from "@/services/api-assignments"
import { ModulesService } from "@/services/modules"
import type { ApiAssignmentPublic } from "@/services/api-assignments"
import type { ApiModulePublic } from "@/services/modules"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const createFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  client_id: z
    .string()
    .max(255)
    .optional()
    .refine(
      (val) => !val || val.trim().length > 0,
      "Client ID cannot be empty or contain only spaces",
    )
    .refine(
      (val) => !val || val.trim().length >= 1,
      "Client ID must be at least 1 character",
    )
    .refine(
      (val) => !val || /^[A-Za-z0-9_-]+$/.test(val.trim()),
      "Client ID can only contain letters, numbers, underscores (_), and hyphens (-)",
    )
    .refine(
      (val) => !val || val === val.trim(),
      "Client ID cannot have leading or trailing spaces",
    ),
  client_secret: z
    .string()
    .max(512)
    .optional()
    .refine(
      (val) => !val || val.length >= 8,
      "Secret must be at least 8 characters",
    )
    .refine(
      (val) => !val || val.length <= 512,
      "Secret cannot exceed 512 characters",
    ),
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

type CreateFormValues = z.infer<typeof createFormSchema>

export const Route = createFileRoute("/_layout/system/clients/create")({
  component: CreateClientPage,
  head: () => ({
    meta: [
      {
        title: "Create Client - System",
      },
    ],
  }),
})

function CreateClientPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

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

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createFormSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      client_id: "",
      client_secret: "",
      description: null,
      rate_limit_per_minute: null,
      max_concurrent: null,
      is_active: true,
      group_ids: [],
      api_assignment_ids: [],
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: AppClientCreate) => ClientsService.create(data),
    onSuccess: () => {
      showSuccessToast("Client created successfully")
      form.reset()
      queryClient.invalidateQueries({ queryKey: ["clients"] })
      navigate({ to: "/system/clients" })
    },
    onError: handleError.bind(showErrorToast),
  })

  const onSubmit = (data: CreateFormValues) => {
    const generateRandomString = (length: number) => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
      const array = new Uint32Array(length)
      if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        crypto.getRandomValues(array)
      } else {
        for (let i = 0; i < length; i++) {
          array[i] = Math.floor(Math.random() * 0xffffffff)
        }
      }
      return Array.from(array, (v) => chars[v % chars.length]).join("")
    }

    const trimmedClientId = data.client_id?.trim() || ""
    const finalClientId = trimmedClientId.length > 0 ? trimmedClientId : generateRandomString(16)

    const trimmedClientSecret = data.client_secret?.trim() || ""
    const finalClientSecret =
      trimmedClientSecret.length >= 8 ? trimmedClientSecret : generateRandomString(32)

    createMutation.mutate({
      name: data.name,
      client_id: finalClientId,
      client_secret: finalClientSecret,
      description: data.description,
      rate_limit_per_minute:
        data.rate_limit_per_minute === "" || data.rate_limit_per_minute == null
          ? null
          : Number(data.rate_limit_per_minute),
      max_concurrent:
        data.max_concurrent === "" || data.max_concurrent == null
          ? null
          : Number(data.max_concurrent),
      is_active: data.is_active,
      group_ids: data.group_ids.length > 0 ? data.group_ids : undefined,
      api_assignment_ids: data.api_assignment_ids.length > 0 ? data.api_assignment_ids : undefined,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link to="/system/clients">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Create Client</h1>
          <p className="text-muted-foreground">
            Create a new client application with credentials
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Client Configuration</CardTitle>
              <CardDescription>
                Fill in the table below to create a new client. Client ID and Secret can be customized or left
                empty to auto-generate.
              </CardDescription>
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
                      <FormField
                        control={form.control}
                        name="client_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                placeholder="Leave empty to auto-generate (URL-safe: A-Za-z0-9_-)"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormDescription>
                              Optional. Only letters, numbers, underscores (_), and hyphens (-). Leave empty to auto-generate.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead className="w-[180px]">Client Secret</TableHead>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name="client_secret"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="Leave empty to auto-generate (min 8 characters)"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormDescription>
                              Optional. Minimum 8 characters, maximum 512 characters. Leave empty to auto-generate a secure secret.
                            </FormDescription>
                            <FormMessage />
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
                                placeholder="Client description"
                                {...field}
                                value={field.value || ""}
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
              loading={createMutation.isPending}
            >
              Create Client
            </LoadingButton>
          </div>
        </form>
      </Form>
    </div>
  )
}
