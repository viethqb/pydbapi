import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { TopPathPoint } from "@/services/overview"

function methodVariant(
  method: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (method === "GET") return "secondary"
  if (method === "POST") return "default"
  if (method === "PUT" || method === "PATCH") return "outline"
  if (method === "DELETE") return "destructive"
  return "outline"
}

export function TopPathsTable(props: {
  rows: TopPathPoint[]
  isLoading?: boolean
  limit?: number
  onLimitChange?: (limit: number) => void
  days?: number
  onDaysChange?: (days: number) => void
}) {
  const { rows, isLoading, limit = 10, onLimitChange, days = 14, onDaysChange } = props
  const [localLimit, setLocalLimit] = useState(String(limit))
  const [localDays, setLocalDays] = useState(String(days))

  useEffect(() => {
    setLocalLimit(String(limit))
  }, [limit])

  useEffect(() => {
    setLocalDays(String(days))
  }, [days])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Top paths</CardTitle>
        <div className="flex items-center gap-2">
          <Select
            value={localDays}
            onValueChange={(value) => {
              setLocalDays(value)
              const d = Number.parseInt(value, 10)
              if (!Number.isNaN(d) && onDaysChange) {
                onDaysChange(d)
              }
            }}
          >
            <SelectTrigger className="w-[140px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Today</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={localLimit}
            onValueChange={(value) => {
              setLocalLimit(value)
              const l = Number.parseInt(value, 10)
              if (!Number.isNaN(l) && onLimitChange) {
                onLimitChange(l)
              }
            }}
          >
            <SelectTrigger className="w-[100px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">Top 5</SelectItem>
              <SelectItem value="10">Top 10</SelectItem>
              <SelectItem value="15">Top 15</SelectItem>
              <SelectItem value="20">Top 20</SelectItem>
              <SelectItem value="50">Top 50</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No request data yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Method</TableHead>
                <TableHead>Path</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead className="text-right">Avg Duration</TableHead>
                <TableHead className="text-right">Success</TableHead>
                <TableHead className="text-right">Fail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.http_method}-${r.path}-${i}`}>
                  <TableCell>
                    <Badge variant={methodVariant(r.http_method)}>
                      {r.http_method}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[400px] truncate font-mono text-sm">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>/api/{r.path.replace(/^\/+/, "")}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-md break-all">/api/{r.path.replace(/^\/+/, "")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.count.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.avg_duration_ms != null ? `${r.avg_duration_ms} ms` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600">
                    {r.success_count.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">
                    {r.fail_count.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
