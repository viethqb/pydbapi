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
import type { ApiMacroDefPublic, MacroTypeEnum } from "@/services/macro-defs"

export type MacroDefTableData = ApiMacroDefPublic & {
  onDelete?: (id: string) => void
  moduleName?: string | null
  canUpdate?: boolean
  canDelete?: boolean
}

export const macroDefColumns: ColumnDef<MacroDefTableData>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      const id = row.original.id
      return (
        <Link
          to="/api-dev/macro-defs/$id"
          params={{ id }}
          className="font-medium hover:underline"
        >
          {row.original.name}
        </Link>
      )
    },
  },
  {
    accessorKey: "macro_type",
    header: "Type",
    cell: ({ row }) => {
      const t = row.original.macro_type as MacroTypeEnum
      return (
        <Badge variant={t === "JINJA" ? "secondary" : "outline"}>
          {t}
        </Badge>
      )
    },
  },
  {
    accessorKey: "is_published",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.is_published ? "default" : "outline"}>
        {row.original.is_published ? "Published" : "Draft"}
      </Badge>
    ),
  },
  {
    accessorKey: "module_id",
    header: "Scope",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.module_id
          ? (row.original as MacroDefTableData).moduleName ?? "Module"
          : "Global"}
      </span>
    ),
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm max-w-[200px] truncate block">
        {row.original.description || "—"}
      </span>
    ),
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
      const macro = row.original
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
                to="/api-dev/macro-defs/$id"
                params={{ id: macro.id }}
                className="block"
              >
                <DropdownMenuItem>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </DropdownMenuItem>
              </Link>
              {macro.canUpdate !== false && (
                <Link
                  to="/api-dev/macro-defs/$id/edit"
                  params={{ id: macro.id }}
                  className="block"
                >
                  <DropdownMenuItem>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                </Link>
              )}
              <DropdownMenuSeparator />
              {macro.canDelete !== false && macro.onDelete && (
                <DropdownMenuItem
                  onClick={() => macro.onDelete?.(macro.id)}
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
