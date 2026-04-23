import { Link } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { Eye, MoreHorizontal, Play, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { ReportTemplatePublic } from "@/services/report"

export type TemplateTableData = ReportTemplatePublic & {
  module_name?: string
  onDelete?: (id: string) => void
  onToggleStatus?: (id: string, currentStatus: boolean) => void
  canUpdate?: boolean
  canDelete?: boolean
  canExecute?: boolean
}

export const reportTemplatesColumns: ColumnDef<TemplateTableData>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <Link
        to="/report-management/templates/$tid"
        params={{ tid: row.original.id }}
        className="font-medium hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "module_name",
    header: "Module",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.module_name || "-"}
      </span>
    ),
  },
  {
    accessorKey: "template_path",
    header: "Template",
    cell: ({ row }) => {
      const t = row.original
      if (!t.template_path) {
        return <Badge variant="outline">Blank</Badge>
      }
      return (
        <span className="font-mono text-sm text-muted-foreground">
          {t.template_bucket}/{t.template_path}
        </span>
      )
    },
  },
  {
    accessorKey: "recalc_enabled",
    header: "Recalc",
    cell: ({ row }) =>
      row.original.recalc_enabled ? (
        <Badge variant="default">On</Badge>
      ) : (
        <Badge variant="outline">Off</Badge>
      ),
  },
  {
    accessorKey: "output_sheet",
    header: "Output",
    cell: ({ row }) =>
      row.original.output_sheet ? (
        <div className="flex gap-1 flex-wrap">
          {row.original.output_sheet
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
            .map((s: string) => (
              <Badge key={s} variant="secondary">
                {s}
              </Badge>
            ))}
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">Full file</span>
      ),
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => {
      const t = row.original
      return (
        <Button
          variant="ghost"
          className="h-auto p-2 hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation()
            t.onToggleStatus?.(t.id, t.is_active)
          }}
          disabled={!t.canUpdate}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                t.is_active ? "bg-green-500" : "bg-gray-400",
              )}
            />
            <span className={t.is_active ? "" : "text-muted-foreground"}>
              {t.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </Button>
      )
    },
  },
  {
    accessorKey: "updated_at",
    header: "Updated",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {new Date(row.original.updated_at).toLocaleDateString()}
      </span>
    ),
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => {
      const t = row.original
      return (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <Link
                to="/report-management/templates/$tid"
                params={{ tid: t.id }}
                className="block"
              >
                <DropdownMenuItem>
                  <Eye className="mr-2 h-4 w-4" />
                  Detail
                </DropdownMenuItem>
              </Link>
              {t.canExecute && t.is_active && (
                <Link
                  to="/report-management/templates/$tid"
                  params={{ tid: t.id }}
                  className="block"
                >
                  <DropdownMenuItem>
                    <Play className="mr-2 h-4 w-4" />
                    Generate
                  </DropdownMenuItem>
                </Link>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!t.canDelete}
                onClick={!t.canDelete ? undefined : () => t.onDelete?.(t.id)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    },
  },
]
