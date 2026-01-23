import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "@tanstack/react-router"
import { MoreHorizontal, Trash2, Eye, Pencil, Globe } from "lucide-react"

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
import type { ApiAssignmentPublic } from "@/services/api-assignments"

export type ApiTableData = ApiAssignmentPublic & {
  module_name?: string
  datasource_name?: string
  onDelete?: (id: string) => void
  onPublish?: (id: string) => void
}

export const apiColumns: ColumnDef<ApiTableData>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      const id = row.original.id
      return (
        <Link
          to="/api-dev/apis/$id"
          params={{ id }}
          className="font-medium hover:underline"
        >
          {row.original.name}
        </Link>
      )
    },
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
    accessorKey: "path",
    header: "Path",
    cell: ({ row }) => (
      <span className="text-muted-foreground font-mono text-sm">
        {row.original.path}
      </span>
    ),
  },
  {
    accessorKey: "http_method",
    header: "Method",
    cell: ({ row }) => {
      const method = row.original.http_method
      const colors: Record<string, string> = {
        GET: "bg-blue-500",
        POST: "bg-green-500",
        PUT: "bg-yellow-500",
        DELETE: "bg-red-500",
        PATCH: "bg-purple-500",
      }
      return (
        <Badge className={colors[method] || "bg-gray-500"}>
          {method}
        </Badge>
      )
    },
  },
  {
    accessorKey: "execute_engine",
    header: "Engine",
    cell: ({ row }) => {
      const engine = row.original.execute_engine
      return (
        <Badge variant="outline" className="uppercase">
          {engine}
        </Badge>
      )
    },
  },
  {
    accessorKey: "datasource_name",
    header: "DataSource",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.datasource_name || "-"}
      </span>
    ),
  },
  {
    accessorKey: "is_published",
    header: "Status",
    cell: ({ row }) => {
      const isPublished = row.original.is_published
      return (
        <Badge variant={isPublished ? "default" : "outline"}>
          {isPublished ? "Published" : "Draft"}
        </Badge>
      )
    },
  },
  {
    accessorKey: "access_type",
    header: "Access",
    cell: ({ row }) => {
      const accessType = row.original.access_type || "private"
      return (
        <Badge variant={accessType === "public" ? "default" : "secondary"}>
          {accessType === "public" ? "Public" : "Private"}
        </Badge>
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
      const api = row.original
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
                to="/api-dev/apis/$id"
                params={{ id: api.id }}
                className="block"
              >
                <DropdownMenuItem>
                  <Eye className="mr-2 h-4 w-4" />
                  Detail
                </DropdownMenuItem>
              </Link>
              <Link
                to="/api-dev/apis/$id/edit"
                params={{ id: api.id }}
                className="block"
              >
                <DropdownMenuItem>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              </Link>
              {api.onPublish && !api.is_published && (
                <DropdownMenuItem
                  onClick={() => api.onPublish?.(api.id)}
                >
                  <Globe className="mr-2 h-4 w-4" />
                  Publish
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {api.onDelete && (
                <DropdownMenuItem
                  onClick={() => api.onDelete?.(api.id)}
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
