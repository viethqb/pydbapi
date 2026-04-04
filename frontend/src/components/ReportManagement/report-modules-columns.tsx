import { Link } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react"

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
import type { ReportModulePublic } from "@/services/report"

export type ModuleTableData = ReportModulePublic & {
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onToggleStatus?: (id: string, currentStatus: boolean) => void
  canUpdate?: boolean
  canDelete?: boolean
}

export const reportModulesColumns: ColumnDef<ModuleTableData>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <Link
        to="/report-management/modules/$id"
        params={{ id: row.original.id }}
        className="font-medium text-primary hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.description || "-"}
      </span>
    ),
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => {
      const mod = row.original
      return (
        <Button
          variant="ghost"
          className="h-auto p-2 hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation()
            mod.onToggleStatus?.(mod.id, mod.is_active)
          }}
          disabled={!mod.canUpdate}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                mod.is_active ? "bg-green-500" : "bg-gray-400",
              )}
            />
            <span className={mod.is_active ? "" : "text-muted-foreground"}>
              {mod.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </Button>
      )
    },
  },
  {
    accessorKey: "updated_at",
    header: "Updated",
    cell: ({ row }) => {
      const date = new Date(row.original.updated_at)
      return (
        <span className="text-muted-foreground text-sm">
          {date.toLocaleDateString()}
        </span>
      )
    },
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => {
      const mod = row.original
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
              <DropdownMenuItem asChild>
                <Link
                  to="/report-management/modules/$id"
                  params={{ id: mod.id }}
                  className="flex cursor-pointer items-center"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              {mod.canUpdate && (
                <DropdownMenuItem
                  onClick={() => mod.onEdit?.(mod.id)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!mod.canDelete}
                onClick={
                  !mod.canDelete
                    ? undefined
                    : () => mod.onDelete?.(mod.id)
                }
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
