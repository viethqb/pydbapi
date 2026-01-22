import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal, Pencil, Trash2, Key } from "lucide-react"

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
import type { AppClientPublic } from "@/services/clients"

export type ClientTableData = AppClientPublic & {
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onRegenerateSecret?: (id: string) => void
  onToggleStatus?: (id: string, currentStatus: boolean) => void
}

export const clientsColumns: ColumnDef<ClientTableData>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.name}</span>
    ),
  },
  {
    accessorKey: "client_id",
    header: "Client ID",
    cell: ({ row }) => (
      <span className="font-mono text-sm text-muted-foreground">
        {row.original.client_id}
      </span>
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
      const client = row.original
      return (
        <Button
          variant="ghost"
          className="h-auto p-2 hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation()
            client.onToggleStatus?.(client.id, client.is_active)
          }}
          disabled={!client.onToggleStatus}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                client.is_active ? "bg-green-500" : "bg-gray-400",
              )}
            />
            <span
              className={client.is_active ? "" : "text-muted-foreground"}
            >
              {client.is_active ? "Active" : "Inactive"}
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
      const client = row.original
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
              {client.onEdit && (
                <DropdownMenuItem
                  onClick={() => client.onEdit?.(client.id)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {client.onRegenerateSecret && (
                <DropdownMenuItem
                  onClick={() => client.onRegenerateSecret?.(client.id)}
                >
                  <Key className="mr-2 h-4 w-4" />
                  Regenerate Secret
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {client.onDelete && (
                <DropdownMenuItem
                  onClick={() => client.onDelete?.(client.id)}
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
