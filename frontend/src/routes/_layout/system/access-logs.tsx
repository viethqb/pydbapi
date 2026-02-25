import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Textarea } from "@/components/ui/textarea"
import { ApiAssignmentsService } from "@/services/api-assignments"
import {
  AccessLogsService,
  type AccessRecordDetail,
  type AccessRecordPublic,
} from "@/services/access-logs"
import { ClientsService } from "@/services/clients"
import { GroupsService } from "@/services/groups"
import { ModulesService } from "@/services/modules"
import { usePermissions } from "@/hooks/usePermissions"
import useCustomToast from "@/hooks/useCustomToast"

export const Route = createFileRoute("/_layout/system/access-logs")({
  component: AccessLogsPage,
  head: () => ({
    meta: [{ title: "Access logs - System" }],
  }),
})

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function methodVariant(method: string): "default" | "secondary" | "destructive" | "outline" {
  if (method === "GET") return "secondary"
  if (method === "POST") return "default"
  if (method === "PUT" || method === "PATCH") return "outline"
  if (method === "DELETE") return "destructive"
  return "outline"
}

function statusVariant(status: number): "default" | "secondary" | "destructive" | "outline" {
  if (status >= 500) return "destructive"
  if (status >= 400) return "destructive"
  if (status >= 300) return "secondary"
  return "outline"
}

/** Format path as /{module}/{path} (ensure leading slash). */
function formatFullPath(path: string | null | undefined): string {
  if (path == null || path === "") return "—"
  return path.startsWith("/") ? path : `/${path}`
}

type FullContentPayload =
  | { title: string; value: string }
  | { title: string; logId: string; field: "request_body" | "request_headers" | "request_params" }

function AccessLogsPage() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { hasPermission } = usePermissions()
  const canReadAccessLog = hasPermission("access_log", "read")
  const canUpdateAccessLog = hasPermission("access_log", "update")

  const [configDsId, setConfigDsId] = useState<string | null>("__main__")
  const [useStarrocksAudit, setUseStarrocksAudit] = useState(false)
  const [fullContentDialog, setFullContentDialog] = useState<FullContentPayload | null>(null)
  const [filters, setFilters] = useState({
    module_id: null as string | null,
    group_id: null as string | null,
    api_assignment_id: null as string | null,
    app_client_id: null as string | null,
    path__ilike: "",
    http_method: "",
    time_from: "",
    time_to: "",
    status: "all" as "all" | "success" | "fail",
    page: 1,
    page_size: 20,
  })

  const [moduleSearch, setModuleSearch] = useState("")
  const [apiSearch, setApiSearch] = useState("")
  const [clientSearch, setClientSearch] = useState("")
  const [groupSearch, setGroupSearch] = useState("")

  const { data: config } = useQuery({
    queryKey: ["access-log-config"],
    queryFn: () => AccessLogsService.getConfig(),
    enabled: canReadAccessLog,
  })
  const configSyncedRef = useRef(false)
  useEffect(() => {
    if (config != null && !configSyncedRef.current) {
      setConfigDsId(config.datasource_id ?? "__main__")
      setUseStarrocksAudit(config.use_starrocks_audit ?? false)
      configSyncedRef.current = true
    }
  }, [config])
  const { data: datasourceOptions } = useQuery({
    queryKey: ["access-log-datasource-options"],
    queryFn: () => AccessLogsService.getDatasourceOptions(),
    enabled: canReadAccessLog,
  })
  const { data: apiList } = useQuery({
    queryKey: ["api-assignments-for-filter"],
    queryFn: () => ApiAssignmentsService.list({ page: 1, page_size: 500 }),
  })
  const { data: clientsList } = useQuery({
    queryKey: ["clients-for-access-log-filter"],
    queryFn: () => ClientsService.list({ page: 1, page_size: 500 }),
  })
  const { data: modulesList } = useQuery({
    queryKey: ["modules-simple-for-access-log-filter"],
    queryFn: () => ModulesService.listSimple(),
  })
  const { data: groupsList } = useQuery({
    queryKey: ["groups-for-access-log-filter", groupSearch],
    queryFn: () =>
      GroupsService.list({
        page: 1,
        page_size: 50,
        name__ilike: groupSearch.trim() || null,
        is_active: true,
      }),
  })

  const listParams = {
    module_id: filters.module_id || null,
    group_id: filters.group_id || null,
    api_assignment_id: filters.api_assignment_id || null,
    app_client_id: filters.app_client_id || null,
    path__ilike: filters.path__ilike.trim() || null,
    http_method: filters.http_method.trim() || null,
    time_from: filters.time_from
      ? new Date(filters.time_from).toISOString()
      : null,
    time_to: filters.time_to
      ? new Date(filters.time_to).toISOString()
      : null,
    status: filters.status === "all" ? null : filters.status,
    page: filters.page,
    page_size: filters.page_size,
  }

  const moduleById = new Map((modulesList ?? []).map((m) => [m.id, m]))
  const formatApiFullPath = (api: { module_id: string; path: string }) => {
    const p = (api.path || "").replace(/^\/+|\/+$/g, "")
    return `/api/${p}`
  }
  const formatApiLabel = (api: { http_method: string; name: string; module_id: string; path: string }) => {
    const modName = moduleById.get(api.module_id)?.name ?? "Unknown module"
    return `[${api.http_method}] [${modName}] [${api.name}] ${formatApiFullPath(api)}`
  }

  const modulesFiltered = (modulesList ?? []).filter((m) => {
    const q = moduleSearch.trim().toLowerCase()
    if (!q) return true
    return (
      m.name.toLowerCase().includes(q) ||
      (m.path_prefix || "").toLowerCase().includes(q)
    )
  })
  const apisFiltered = (apiList?.data ?? []).filter((a) => {
    const q = apiSearch.trim().toLowerCase()
    if (!q) return true
    const label = formatApiLabel({
      http_method: a.http_method,
      name: a.name,
      module_id: a.module_id,
      path: a.path,
    }).toLowerCase()
    return label.includes(q)
  })
  const clientsFiltered = (clientsList?.data ?? []).filter((c) => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return true
    return (
      c.name.toLowerCase().includes(q) ||
      (c.client_id || "").toLowerCase().includes(q)
    )
  })
  const { data: listData, isLoading } = useQuery({
    queryKey: ["access-logs", listParams],
    queryFn: () => AccessLogsService.list(listParams),
    enabled: canReadAccessLog,
  })

  const needDetail =
    fullContentDialog != null && "logId" in fullContentDialog && fullContentDialog.logId != null
  const detailLogId = needDetail && fullContentDialog ? fullContentDialog.logId : null
  const { data: detailRecord, isLoading: detailLoading } = useQuery({
    queryKey: ["access-log-detail", detailLogId],
    queryFn: ({ queryKey }) =>
      AccessLogsService.getDetail(queryKey[1] as string),
    enabled: !!detailLogId && canReadAccessLog,
  })

  const putConfigMutation = useMutation({
    mutationFn: (body: {
      datasource_id: string | null
      use_starrocks_audit: boolean
    }) => AccessLogsService.putConfig(body),
    onSuccess: (updated) => {
      showSuccessToast("Access log storage updated")
      setConfigDsId(updated.datasource_id ?? "__main__")
      setUseStarrocksAudit(updated.use_starrocks_audit ?? false)
      queryClient.invalidateQueries({ queryKey: ["access-log-config"] })
      queryClient.invalidateQueries({ queryKey: ["access-logs"] })
    },
    onError: (e: Error) => showErrorToast(e.message),
  })

  const initTableMutation = useMutation({
    mutationFn: () => AccessLogsService.initExternalTable(),
    onSuccess: (res) => {
      showSuccessToast(res.message)
    },
    onError: (e: Error) => showErrorToast(e.message),
  })

  const currentConfigDsId = config?.datasource_id ?? null
  const effectiveConfigDsId = configDsId === "__main__" ? null : configDsId
  const selectedDsOption = datasourceOptions?.data?.find((d) => d.id === configDsId)
  const isMySQL = selectedDsOption?.product_type === "mysql"

  const handleSaveConfig = () => {
    putConfigMutation.mutate({
      datasource_id: effectiveConfigDsId,
      use_starrocks_audit: isMySQL ? useStarrocksAudit : false,
    })
  }

  const showFullContent = (title: string, value: string) => {
    if (value == null || value === "") return
    setFullContentDialog({ title, value })
  }

  const showFullContentFromDetail = (
    title: string,
    logId: string,
    field: "request_body" | "request_headers" | "request_params",
  ) => {
    setFullContentDialog({ title, logId, field })
  }

  const total = listData?.total ?? 0
  const rows: AccessRecordPublic[] = listData?.data ?? []
  const totalPages = Math.max(1, Math.ceil(total / filters.page_size))

  if (!canReadAccessLog) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">Access logs</h1>
          <p className="text-muted-foreground">
            You do not have permission to view access logs.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Access logs</h1>
        <p className="text-muted-foreground">
          Configure where logs are stored and filter by API, time, and status
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Access log storage</CardTitle>
          <p className="text-sm text-muted-foreground">
            Use main database or an external DataSource (e.g. StarRocks) for better performance
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px] space-y-2">
            <Label>Storage</Label>
            <Select
              value={configDsId ?? "__main__"}
              onValueChange={(v) => setConfigDsId(v === "__main__" ? "__main__" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select storage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__main__">Main database</SelectItem>
                {datasourceOptions?.data?.map((ds) => (
                  <SelectItem key={ds.id} value={ds.id}>
                    {ds.name} ({ds.product_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isMySQL && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="use-starrocks"
                checked={useStarrocksAudit}
                onCheckedChange={(v) => setUseStarrocksAudit(v === true)}
              />
              <label
                htmlFor="use-starrocks"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Use StarRocks audit schema
              </label>
            </div>
          )}
          <Button
            onClick={handleSaveConfig}
            disabled={
              !canUpdateAccessLog ||
              putConfigMutation.isPending ||
              (effectiveConfigDsId === currentConfigDsId &&
                (config?.use_starrocks_audit ?? false) === useStarrocksAudit &&
                (currentConfigDsId !== null || configDsId === "__main__"))
            }
          >
            {putConfigMutation.isPending ? "Saving…" : "Save"}
          </Button>
          {effectiveConfigDsId && (
            <Button
              variant="outline"
              onClick={() => initTableMutation.mutate()}
              disabled={!canUpdateAccessLog || initTableMutation.isPending}
            >
              {initTableMutation.isPending
                ? "Creating…"
                : useStarrocksAudit && isMySQL
                  ? "Create StarRocks audit schema"
                  : "Create table in external DB"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="w-[120px] font-medium text-muted-foreground">Module</TableCell>
                <TableCell className="w-[240px]">
                  <Select
                    value={filters.module_id ?? "__all__"}
                    onValueChange={(v) =>
                      setFilters((f) => ({
                        ...f,
                        module_id: v === "__all__" ? null : v,
                        api_assignment_id: null, // reset API when module changes
                        page: 1,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full max-w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-2">
                        <Input
                          placeholder="Search module…"
                          value={moduleSearch}
                          onChange={(e) => setModuleSearch(e.target.value)}
                        />
                      </div>
                      <SelectItem value="__all__">All modules</SelectItem>
                      {modulesFiltered.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} ({m.path_prefix})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="w-[120px] font-medium text-muted-foreground">Group</TableCell>
                <TableCell className="w-[240px]">
                  <Select
                    value={filters.group_id ?? "__all__"}
                    onValueChange={(v) =>
                      setFilters((f) => ({
                        ...f,
                        group_id: v === "__all__" ? null : v,
                        page: 1,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full max-w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-2">
                        <Input
                          placeholder="Search group…"
                          value={groupSearch}
                          onChange={(e) => setGroupSearch(e.target.value)}
                        />
                      </div>
                      <SelectItem value="__all__">All groups</SelectItem>
                      {(groupsList?.data ?? []).map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="w-[120px] font-medium text-muted-foreground">API</TableCell>
                <TableCell className="w-[240px]">
                  <Select
                    value={filters.api_assignment_id ?? "__all__"}
                    onValueChange={(v) =>
                      setFilters((f) => ({
                        ...f,
                        api_assignment_id: v === "__all__" ? null : v,
                        page: 1,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full max-w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-2">
                        <Input
                          placeholder="Search API…"
                          value={apiSearch}
                          onChange={(e) => setApiSearch(e.target.value)}
                        />
                      </div>
                      <SelectItem value="__all__">All APIs</SelectItem>
                      {apisFiltered
                        .filter((a) => !filters.module_id || a.module_id === filters.module_id)
                        .map((api) => (
                          <SelectItem key={api.id} value={api.id}>
                            {formatApiLabel({
                              http_method: api.http_method,
                              name: api.name,
                              module_id: api.module_id,
                              path: api.path,
                            })}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="w-[120px] font-medium text-muted-foreground">Client</TableCell>
                <TableCell className="w-[240px]">
                  <Select
                    value={filters.app_client_id ?? "__all__"}
                    onValueChange={(v) =>
                      setFilters((f) => ({
                        ...f,
                        app_client_id: v === "__all__" ? null : v,
                        page: 1,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full max-w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-2">
                        <Input
                          placeholder="Search client…"
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                        />
                      </div>
                      <SelectItem value="__all__">All clients</SelectItem>
                      {clientsFiltered.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-muted-foreground">Path (contains)</TableCell>
                <TableCell>
                  <Input
                    placeholder="e.g. /report"
                    className="w-full max-w-[220px]"
                    value={filters.path__ilike}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, path__ilike: e.target.value, page: 1 }))
                    }
                  />
                </TableCell>
                <TableCell className="font-medium text-muted-foreground">HTTP method</TableCell>
                <TableCell>
                  <Select
                    value={filters.http_method || "__all__"}
                    onValueChange={(v) =>
                      setFilters((f) => ({
                        ...f,
                        http_method: v === "__all__" ? "" : v,
                        page: 1,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full max-w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All</SelectItem>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="PATCH">PATCH</SelectItem>
                      <SelectItem value="DELETE">DELETE</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-muted-foreground">Time from</TableCell>
                <TableCell>
                  <Input
                    type="datetime-local"
                    className="w-full max-w-[220px]"
                    value={filters.time_from}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, time_from: e.target.value, page: 1 }))
                    }
                  />
                </TableCell>
                <TableCell className="font-medium text-muted-foreground">Time to</TableCell>
                <TableCell>
                  <Input
                    type="datetime-local"
                    className="w-full max-w-[220px]"
                    value={filters.time_to}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, time_to: e.target.value, page: 1 }))
                    }
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-muted-foreground">Status</TableCell>
                <TableCell colSpan={3}>
                  <Select
                    value={filters.status}
                    onValueChange={(v: "all" | "success" | "fail") =>
                      setFilters((f) => ({ ...f, status: v, page: 1 }))
                    }
                  >
                    <SelectTrigger className="w-full max-w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="fail">Fail</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
          <p className="text-sm text-muted-foreground">
            {total} record{total !== 1 ? "s" : ""} total
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground">No access records match the filters.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Method</TableHead>
                    <TableHead>Full path</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead className="max-w-[140px]">Body</TableHead>
                    <TableHead className="max-w-[140px]">Headers</TableHead>
                    <TableHead className="max-w-[140px]">Params</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Badge variant={methodVariant(r.http_method)}>
                          {r.http_method}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="max-w-[240px] truncate cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          r.path != null &&
                          r.path !== "" &&
                          showFullContent("Full path", formatFullPath(r.path))
                        }
                        title="Click to view full"
                      >
                        {formatFullPath(r.path)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(r.status_code)}>
                          {r.status_code}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.duration_ms != null ? `${r.duration_ms} ms` : "—"}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate">{r.ip_address}</TableCell>
                      <TableCell
                        className="max-w-[140px] truncate font-mono text-xs cursor-pointer hover:bg-muted/50"
                        title="Click to view full"
                        onClick={() => showFullContentFromDetail("Request body", r.id, "request_body")}
                      >
                        {r.request_body ?? "—"}
                      </TableCell>
                      <TableCell
                        className="max-w-[140px] truncate font-mono text-xs cursor-pointer hover:bg-muted/50"
                        title="Click to view full"
                        onClick={() => showFullContentFromDetail("Request headers", r.id, "request_headers")}
                      >
                        {r.request_headers ?? "—"}
                      </TableCell>
                      <TableCell
                        className="max-w-[140px] truncate font-mono text-xs cursor-pointer hover:bg-muted/50"
                        title="Click to view full"
                        onClick={() => showFullContentFromDetail("Request params", r.id, "request_params")}
                      >
                        {r.request_params ?? "—"}
                      </TableCell>
                      <TableCell>{formatDateTime(r.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Page {filters.page} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={filters.page <= 1}
                    onClick={() =>
                      setFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) }))
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={filters.page >= totalPages}
                    onClick={() =>
                      setFilters((f) => ({ ...f, page: f.page + 1 }))
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!fullContentDialog} onOpenChange={(open) => !open && setFullContentDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{fullContentDialog?.title}</DialogTitle>
          </DialogHeader>
          {fullContentDialog && (
            <>
              {"value" in fullContentDialog ? (
                <Textarea
                  readOnly
                  className="min-h-[200px] font-mono text-xs"
                  value={fullContentDialog.value}
                />
              ) : detailLoading ? (
                <p className="text-muted-foreground py-4">Loading…</p>
              ) : detailRecord ? (
                <Textarea
                  readOnly
                  className="min-h-[200px] font-mono text-xs"
                  value={
                    (detailRecord as AccessRecordDetail)[fullContentDialog.field] ??
                    ""
                  }
                />
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

