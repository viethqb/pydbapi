import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/Common/DataTable"
import {
  groupsColumns,
  type GroupTableData,
} from "@/components/System/groups-columns"
import { GroupFormDialog } from "@/components/System/GroupFormDialog"
import {
  GroupsService,
  type ApiGroupListIn,
  type ApiGroupPublic,
} from "@/services/groups"
import useCustomToast from "@/hooks/useCustomToast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export const Route = createFileRoute("/_layout/system/groups")({
  component: GroupsPage,
  head: () => ({
    meta: [
      {
        title: "Groups - System",
      },
    ],
  }),
})

function GroupsPage() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // Filters state
  const [filters, setFilters] = useState<ApiGroupListIn>({
    page: 1,
    page_size: 20,
    name__ilike: null,
    is_active: null,
  })

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<ApiGroupPublic | null>(
    null,
  )

  // Query for list
  const { data, isLoading } = useQuery({
    queryKey: ["groups", filters],
    queryFn: () => GroupsService.list(filters),
  })

  // Delete mutation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => GroupsService.delete(id),
    onSuccess: () => {
      showSuccessToast("Group deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["groups"] })
      setDeleteId(null)
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
      setDeleteId(null)
    },
  })

  // Toggle status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({
      id,
      currentStatus,
    }: {
      id: string
      currentStatus: boolean
    }) => {
      return GroupsService.update({
        id,
        is_active: !currentStatus,
      })
    },
    onSuccess: (updated) => {
      if (updated.is_active) {
        showSuccessToast("Group activated successfully")
      } else {
        showErrorToast("Group has been deactivated", "Deactivated")
      }
      queryClient.invalidateQueries({ queryKey: ["groups"] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const handleCreate = () => {
    setEditingGroup(null)
    setIsFormOpen(true)
  }

  const handleEdit = (id: string) => {
    const group = data?.data.find((g) => g.id === id)
    if (group) {
      setEditingGroup(group)
      setIsFormOpen(true)
    }
  }

  const handleDelete = (id: string) => {
    setDeleteId(id)
  }

  const handleToggleStatus = (id: string, currentStatus: boolean) => {
    toggleStatusMutation.mutate({ id, currentStatus })
  }

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId)
    }
  }

  const tableData: GroupTableData[] =
    data?.data.map((group) => ({
      ...group,
      onEdit: handleEdit,
      onDelete: handleDelete,
      onToggleStatus: handleToggleStatus,
    })) || []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Groups</h1>
          <p className="text-muted-foreground">
            Manage API groups for authorization
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Group
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              className="pl-8"
              value={filters.name__ilike || ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  name__ilike: e.target.value || null,
                  page: 1,
                })
              }
            />
          </div>
        </div>
        <Select
          value={
            filters.is_active === null
              ? "all"
              : filters.is_active
                ? "active"
                : "inactive"
          }
          onValueChange={(value) =>
            setFilters({
              ...filters,
              is_active:
                value === "all" ? null : value === "active" ? true : false,
              page: 1,
            })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* DataTable */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading...
        </div>
      ) : (
        <DataTable columns={groupsColumns} data={tableData} />
      )}

      {/* Pagination */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {((filters.page || 1) - 1) * (filters.page_size || 20) + 1} to{" "}
            {Math.min((filters.page || 1) * (filters.page_size || 20), data.total)} of{" "}
            {data.total} entries
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page === 1}
              onClick={() =>
                setFilters({ ...filters, page: (filters.page || 1) - 1 })
              }
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(filters.page || 1) * (filters.page_size || 20) >= data.total}
              onClick={() =>
                setFilters({ ...filters, page: (filters.page || 1) + 1 })
              }
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <GroupFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) {
            setEditingGroup(null)
          }
        }}
        group={editingGroup}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Group</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this group? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteId(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
