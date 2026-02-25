import { Link } from "@tanstack/react-router"

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
import type { AccessRecordPublic } from "@/services/overview"

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function methodVariant(
  method: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (method === "GET") return "secondary"
  if (method === "POST") return "default"
  if (method === "PUT" || method === "PATCH") return "outline"
  if (method === "DELETE") return "destructive"
  return "outline"
}

function statusVariant(
  status: number,
): "default" | "secondary" | "destructive" | "outline" {
  if (status >= 500) return "destructive"
  if (status >= 400) return "destructive"
  if (status >= 300) return "secondary"
  return "outline"
}

export function RecentAccessTable(props: {
  rows: AccessRecordPublic[]
  limit?: number
  onLimitChange?: (limit: number) => void
}) {
  const { rows, limit = 20, onLimitChange } = props

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Recent access</CardTitle>
        <Select
          value={String(limit)}
          onValueChange={(value) => {
            const newLimit = Number.parseInt(value, 10)
            if (!Number.isNaN(newLimit) && onLimitChange) {
              onLimitChange(newLimit)
            }
          }}
        >
          <SelectTrigger className="w-[120px]" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10 records</SelectItem>
            <SelectItem value="20">20 records</SelectItem>
            <SelectItem value="50">50 records</SelectItem>
            <SelectItem value="100">100 records</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No access records yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Method</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>IP</TableHead>
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
                  <TableCell className="max-w-[420px] truncate">
                    {r.api_assignment_id ? (
                      <Link
                        to="/api-dev/apis/$id"
                        params={{ id: r.api_assignment_id }}
                        className="hover:underline"
                      >
                        {r.path}
                      </Link>
                    ) : (
                      r.path
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(r.status_code)}>
                      {r.status_code}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {r.duration_ms != null ? `${r.duration_ms} ms` : "—"}
                  </TableCell>
                  <TableCell>{r.ip_address}</TableCell>
                  <TableCell>{formatDateTime(r.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
