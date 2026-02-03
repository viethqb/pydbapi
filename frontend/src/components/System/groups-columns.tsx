import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "@tanstack/react-router"
import { MoreHorizontal, Pencil, Trash2, Eye } from "lucide-react"

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
import type { ApiGroupPublic } from "@/services/groups"

export type GroupTableData = ApiGroupPublic & {
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onToggleStatus?: (id: string, currentStatus: boolean) => void
  canUpdate?: boolean
  canDelete?: boolean
}

export const groupsColumns: ColumnDef<GroupTableData>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <Link
        to="/system/groups/$id"
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
      const group = row.original
      return (
        <Button
          variant="ghost"
          className="h-auto p-2 hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation()
            group.onToggleStatus?.(group.id, group.is_active)
          }}
          disabled={!group.onToggleStatus}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                group.is_active ? "bg-green-500" : "bg-gray-400",
              )}
            />
            <span
              className={group.is_active ? "" : "text-muted-foreground"}
            >
              {group.is_active ? "Active" : "Inactive"}
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
      const group = row.original
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
                  to="/system/groups/$id"
                  params={{ id: group.id }}
                  className="flex cursor-pointer items-center"
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              {group.canUpdate !== false && group.onEdit && (
                <DropdownMenuItem
                  onClick={() => group.onEdit?.(group.id)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {group.canDelete !== false && group.onDelete && (
                <DropdownMenuItem
                  onClick={() => group.onDelete?.(group.id)}
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
