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
import type { UnifyAlarmPublic } from "@/services/alarm"

export type AlarmTableData = UnifyAlarmPublic & {
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onToggleStatus?: (id: string, currentStatus: boolean) => void
}

export const alarmColumns: ColumnDef<AlarmTableData>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.name}</span>
    ),
  },
  {
    accessorKey: "alarm_type",
    header: "Type",
    cell: ({ row }) => (
      <Badge variant="outline" className="uppercase">
        {row.original.alarm_type}
      </Badge>
    ),
  },
  {
    accessorKey: "config",
    header: "Config",
    cell: ({ row }) => {
      const config = row.original.config
      const configStr = JSON.stringify(config, null, 2)
      const preview = configStr.length > 100
        ? configStr.substring(0, 100) + "..."
        : configStr
      return (
        <span className="font-mono text-xs text-muted-foreground">
          {preview}
        </span>
      )
    },
  },
  {
    accessorKey: "is_enabled",
    header: "Status",
    cell: ({ row }) => {
      const alarm = row.original
      return (
        <Button
          variant="ghost"
          className="h-auto p-2 hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation()
            alarm.onToggleStatus?.(alarm.id, alarm.is_enabled)
          }}
          disabled={!alarm.onToggleStatus}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                alarm.is_enabled ? "bg-green-500" : "bg-gray-400",
              )}
            />
            <span
              className={alarm.is_enabled ? "" : "text-muted-foreground"}
            >
              {alarm.is_enabled ? "Enabled" : "Disabled"}
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
      const alarm = row.original
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
              {alarm.onEdit && (
                <DropdownMenuItem
                  onClick={() => alarm.onEdit?.(alarm.id)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {alarm.onDelete && (
                <DropdownMenuItem
                  onClick={() => alarm.onDelete?.(alarm.id)}
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
