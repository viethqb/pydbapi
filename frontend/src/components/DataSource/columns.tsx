import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "@tanstack/react-router"
import { MoreHorizontal, Play, Trash2, Eye, Pencil } from "lucide-react"

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

// Types - will be replaced with generated types from OpenAPI client
export type DataSourcePublic = {
  id: string
  name: string
  product_type: "postgres" | "mysql"
  host: string
  port: number
  database: string
  username: string
  driver_version: string | null
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type DataSourceTableData = DataSourcePublic & {
  onTest?: (id: string) => void
  onDelete?: (id: string) => void
  onToggleStatus?: (id: string, currentStatus: boolean) => void
}

export const columns: ColumnDef<DataSourceTableData>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      const id = row.original.id
      return (
        <Link
          to="/connection/$id"
          params={{ id }}
          className="font-medium hover:underline"
        >
          {row.original.name}
        </Link>
      )
    },
  },
  {
    accessorKey: "product_type",
    header: "Type",
    cell: ({ row }) => {
      const type = row.original.product_type
      return (
        <Badge variant="outline" className="uppercase">
          {type}
        </Badge>
      )
    },
  },
  {
    accessorKey: "host",
    header: "Host",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.host}:{row.original.port}
      </span>
    ),
  },
  {
    accessorKey: "database",
    header: "Database",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.database}</span>
    ),
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => {
      const datasource = row.original
      return (
        <Button
          variant="ghost"
          className="h-auto p-2 hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation()
            datasource.onToggleStatus?.(datasource.id, datasource.is_active)
          }}
          disabled={!datasource.onToggleStatus}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                datasource.is_active ? "bg-green-500" : "bg-gray-400",
              )}
            />
            <span
              className={datasource.is_active ? "" : "text-muted-foreground"}
            >
              {datasource.is_active ? "Active" : "Inactive"}
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
      const datasource = row.original
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
                to="/connection/$id"
                params={{ id: datasource.id }}
                className="block"
              >
                <DropdownMenuItem>
                  <Eye className="mr-2 h-4 w-4" />
                  Detail
                </DropdownMenuItem>
              </Link>
              <Link
                to="/connection/$id/edit"
                params={{ id: datasource.id }}
                className="block"
              >
                <DropdownMenuItem>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              </Link>
              {datasource.onTest && (
                <DropdownMenuItem
                  onClick={() => datasource.onTest?.(datasource.id)}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Test
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {datasource.onDelete && (
                <DropdownMenuItem
                  onClick={() => datasource.onDelete?.(datasource.id)}
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
