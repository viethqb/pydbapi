import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { ChevronDown, Search, X } from "lucide-react"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  ClientsService,
  type AppClientCreate,
  type AppClientUpdate,
  type AppClientDetail,
} from "@/services/clients"
import { GroupsService } from "@/services/groups"
import { ApiAssignmentsService } from "@/services/api-assignments"
import { ModulesService } from "@/services/modules"
import type { ApiAssignmentPublic } from "@/services/api-assignments"
import type { ApiModulePublic } from "@/services/modules"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  client_secret: z
    .string()
    .max(512)
    .optional()
    .refine(
      (val) => !val || val.length >= 8,
      "Secret must be at least 8 characters",
    ), // Only validate if provided
  description: z.string().max(512).optional().nullable(),
  is_active: z.boolean().default(true),
  group_ids: z.array(z.string()).default([]),
  api_assignment_ids: z.array(z.string()).default([]),
})

type FormValues = z.infer<typeof formSchema>

interface ClientFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  client?: AppClientDetail | null
}

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
}: ClientFormDialogProps) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const isEdit = !!client

  const { data: groupsData } = useQuery({
    queryKey: ["groups-simple"],
    queryFn: () => GroupsService.list({ page: 1, page_size: 100 }),
    enabled: open,
  })

  const { data: apisData } = useQuery({
    queryKey: ["apis-published-for-client"],
    queryFn: () => ApiAssignmentsService.list({ is_published: true, page: 1, page_size: 100 }),
    enabled: open,
  })

  const { data: modulesData } = useQuery({
    queryKey: ["modules-simple"],
    queryFn: () => ModulesService.list({ page: 1, page_size: 100 }),
    enabled: open,
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
      if (!mod) return `/api/${api.path || ""}`.replace(/\/+/g, "/")
      const raw = (mod.path_prefix || "/").replace(/^\/+|\/+$/g, "")
      const seg =
        raw ||
        (mod.name || "")
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "") ||
        "default"
      const p = (api.path || "").replace(/^\//, "")
      return `/api/${seg}/${p}`.replace(/\/+/g, "/")
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
    mode: "onBlur",
    defaultValues: {
      name: "",
      client_secret: "",
      description: null,
      is_active: true,
      group_ids: [],
      api_assignment_ids: [],
    },
  })

  useEffect(() => {
    if (client && open) {
      form.reset({
        name: client.name,
        client_secret: "", // Don't populate secret on edit
        description: client.description,
        is_active: client.is_active,
        group_ids: client.group_ids ?? [],
        api_assignment_ids: client.api_assignment_ids ?? [],
      })
    } else if (!client && open) {
      form.reset({
        name: "",
        client_secret: "",
        description: null,
        is_active: true,
        group_ids: [],
        api_assignment_ids: [],
      })
    }
  }, [client, open, form])

  const createMutation = useMutation({
    mutationFn: (data: AppClientCreate) => ClientsService.create(data),
    onSuccess: () => {
      showSuccessToast("Client created successfully")
      form.reset()
      onOpenChange(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: AppClientUpdate) => ClientsService.update(data),
    onSuccess: () => {
      showSuccessToast("Client updated successfully")
      queryClient.invalidateQueries({ queryKey: ["clients"] })
      queryClient.invalidateQueries({ queryKey: ["client", client?.id] })
      onOpenChange(false)
    },
    onError: (error: Error) => {
      console.error("Update client error:", error)
      showErrorToast(error.message || "Failed to update client")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] })
    },
  })

  const onSubmit = (data: FormValues) => {
    if (isEdit && client) {
      updateMutation.mutate({
        id: client.id,
        name: data.name,
        description: data.description || null,
        is_active: data.is_active,
        group_ids: data.group_ids.length > 0 ? data.group_ids : [],
        api_assignment_ids: data.api_assignment_ids.length > 0 ? data.api_assignment_ids : [],
      })
    } else {
      if (!data.client_secret) {
        showErrorToast("Client secret is required")
        return
      }
      createMutation.mutate({
        name: data.name,
        client_secret: data.client_secret,
        description: data.description,
        is_active: data.is_active,
        group_ids: data.group_ids.length > 0 ? data.group_ids : undefined,
        api_assignment_ids: data.api_assignment_ids.length > 0 ? data.api_assignment_ids : undefined,
      })
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Client" : "Create Client"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the client information below. Note: Client secret cannot be changed here. Use 'Regenerate Secret' to create a new one."
              : "Fill in the form below to create a new client. A client_id will be automatically generated."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Name <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Client name" {...field} required />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isEdit && (
                <FormField
                  control={form.control}
                  name="client_secret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Client Secret <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter client secret (min 8 characters)"
                          {...field}
                          required
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
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

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="font-normal">Active</FormLabel>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="group_ids"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Groups</FormLabel>
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
                            <span className="text-muted-foreground">Select groups (client can call APIs in these groups)...</span>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="api_assignment_ids"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Direct APIs (outside groups)</FormLabel>
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
                                <span className="text-muted-foreground">Select direct APIs (client can call even if not in a group)...</span>
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
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <LoadingButton
                type="submit"
                loading={isLoading}
                disabled={isLoading}
              >
                {isEdit ? "Update" : "Create"}
              </LoadingButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
