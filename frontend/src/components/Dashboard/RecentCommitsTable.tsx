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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { VersionCommitPublic } from "@/services/overview"

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
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

export function RecentCommitsTable(props: {
  rows: VersionCommitPublic[]
  limit?: number
  onLimitChange?: (limit: number) => void
}) {
  const { rows, limit = 20, onLimitChange } = props

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Recent commits</CardTitle>
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
          <div className="text-sm text-muted-foreground">No commits yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>API</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="max-w-[320px]">
                    <div className="flex items-center gap-1.5">
                      {c.http_method && (
                        <Badge
                          variant={methodVariant(c.http_method)}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {c.http_method}
                        </Badge>
                      )}
                      <Link
                        to="/api-dev/apis/$id"
                        params={{ id: c.api_assignment_id }}
                        className="hover:underline font-medium"
                      >
                        {c.full_path ? (
                          <span className="font-mono text-sm">
                            {c.full_path}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {shortId(c.api_assignment_id)}
                          </span>
                        )}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{c.version}</TableCell>
                  <TableCell className="max-w-[300px] truncate">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>{c.commit_message ?? "-"}</span>
                        </TooltipTrigger>
                        {c.commit_message && (
                          <TooltipContent>
                            <p className="max-w-sm break-all">
                              {c.commit_message}
                            </p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.committed_by_username ?? "-"}
                  </TableCell>
                  <TableCell>{formatDateTime(c.committed_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
