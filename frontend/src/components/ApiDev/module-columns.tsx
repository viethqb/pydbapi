import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "@tanstack/react-router"
import { MoreHorizontal, Trash2, Eye, Pencil } from "lucide-react"

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
import type { ApiModulePublic } from "@/services/modules"

export type ModuleTableData = ApiModulePublic & {
  onDelete?: (id: string) => void
  onToggleStatus?: (id: string, currentStatus: boolean) => void
}

export const moduleColumns: ColumnDef<ModuleTableData>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      const id = row.original.id
      return (
        <Link
          to="/api-dev/modules/$id"
          params={{ id }}
          className="font-medium hover:underline"
        >
          {row.original.name}
        </Link>
      )
    },
  },
  {
    accessorKey: "path_prefix",
    header: "Path Prefix",
    cell: ({ row }) => (
      <span className="text-muted-foreground font-mono text-sm">
        {row.original.path_prefix}
      </span>
    ),
  },
  {
    accessorKey: "sort_order",
    header: "Sort Order",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.sort_order}</span>
    ),
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => {
      const module = row.original
      return (
        <Button
          variant="ghost"
          className="h-auto p-2 hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation()
            module.onToggleStatus?.(module.id, module.is_active)
          }}
          disabled={!module.onToggleStatus}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                module.is_active ? "bg-green-500" : "bg-gray-400",
              )}
            />
            <span
              className={module.is_active ? "" : "text-muted-foreground"}
            >
              {module.is_active ? "Active" : "Inactive"}
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
      const module = row.original
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
                to="/api-dev/modules/$id"
                params={{ id: module.id }}
                className="block"
              >
                <DropdownMenuItem>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </DropdownMenuItem>
              </Link>
              <Link
                to="/api-dev/modules/$id/edit"
                params={{ id: module.id }}
                className="block"
              >
                <DropdownMenuItem>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              {module.onDelete && (
                <DropdownMenuItem
                  onClick={() => module.onDelete?.(module.id)}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    },
  },
]
