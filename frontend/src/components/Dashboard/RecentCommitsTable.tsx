import { Link } from "@tanstack/react-router"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { VersionCommitPublic } from "@/services/overview"

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}

export function RecentCommitsTable(props: { rows: VersionCommitPublic[] }) {
  const { rows } = props

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent commits</CardTitle>
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
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="max-w-[260px] truncate">
                    <Link
                      to="/api-dev/apis/$id"
                      params={{ id: c.api_assignment_id }}
                      className="hover:underline"
                    >
                      {shortId(c.api_assignment_id)}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{c.version}</TableCell>
                  <TableCell className="max-w-[420px] truncate">
                    {c.commit_message ?? "-"}
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
