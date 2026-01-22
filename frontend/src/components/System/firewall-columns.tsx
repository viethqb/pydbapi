import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"

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
import type { FirewallRulePublic } from "@/services/firewall"

export type FirewallTableData = FirewallRulePublic & {
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onToggleStatus?: (id: string, currentStatus: boolean) => void
}

export const firewallColumns: ColumnDef<FirewallTableData>[] = [
  {
    accessorKey: "rule_type",
    header: "Type",
    cell: ({ row }) => {
      const type = row.original.rule_type
      return (
        <Badge
          variant={type === "allow" ? "default" : "destructive"}
          className="uppercase"
        >
          {type}
        </Badge>
      )
    },
  },
  {
    accessorKey: "ip_range",
    header: "IP Range",
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.original.ip_range}</span>
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
    accessorKey: "sort_order",
    header: "Order",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.sort_order}</span>
    ),
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => {
      const rule = row.original
      return (
        <Button
          variant="ghost"
          className="h-auto p-2 hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation()
            rule.onToggleStatus?.(rule.id, rule.is_active)
          }}
          disabled={!rule.onToggleStatus}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                rule.is_active ? "bg-green-500" : "bg-gray-400",
              )}
            />
            <span
              className={rule.is_active ? "" : "text-muted-foreground"}
            >
              {rule.is_active ? "Active" : "Inactive"}
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
      const rule = row.original
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
              {rule.onEdit && (
                <DropdownMenuItem
                  onClick={() => rule.onEdit?.(rule.id)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {rule.onDelete && (
                <DropdownMenuItem
                  onClick={() => rule.onDelete?.(rule.id)}
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
