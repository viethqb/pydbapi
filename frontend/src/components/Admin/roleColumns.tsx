import type { ColumnDef } from "@tanstack/react-table"

import type { RolePublic } from "@/services/roles"
import { RoleActionsMenu } from "./RoleActionsMenu"

export const roleColumns: ColumnDef<RolePublic>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.name}</span>
    ),
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.description ?? "—"}
      </span>
    ),
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <RoleActionsMenu role={row.original} />
      </div>
    ),
  },
]
