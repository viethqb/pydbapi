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
  alarmColumns,
  type AlarmTableData,
} from "@/components/System/alarm-columns"
import { AlarmFormDialog } from "@/components/System/AlarmFormDialog"
import {
  AlarmService,
  type UnifyAlarmListIn,
  type UnifyAlarmPublic,
} from "@/services/alarm"
import useCustomToast from "@/hooks/useCustomToast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export const Route = createFileRoute("/_layout/system/alarm")({
  component: AlarmPage,
  head: () => ({
    meta: [
      {
        title: "Alarm - System",
      },
    ],
  }),
})

function AlarmPage() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // Filters state
  const [filters, setFilters] = useState<UnifyAlarmListIn>({
    page: 1,
    page_size: 20,
    alarm_type: null,
    is_enabled: null,
  })

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingAlarm, setEditingAlarm] = useState<UnifyAlarmPublic | null>(
    null,
  )

  // Query for list
  const { data, isLoading } = useQuery({
    queryKey: ["alarm", filters],
    queryFn: () => AlarmService.list(filters),
  })

  // Delete mutation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => AlarmService.delete(id),
    onSuccess: () => {
      showSuccessToast("Alarm deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["alarm"] })
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
      return AlarmService.update({
        id,
        is_enabled: !currentStatus,
      })
    },
    onSuccess: (updated) => {
      if (updated.is_enabled) {
        showSuccessToast("Alarm enabled successfully")
      } else {
        showErrorToast("Alarm has been disabled", "Disabled")
      }
      queryClient.invalidateQueries({ queryKey: ["alarm"] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const handleCreate = () => {
    setEditingAlarm(null)
    setIsFormOpen(true)
  }

  const handleEdit = (id: string) => {
    const alarm = data?.data.find((a) => a.id === id)
    if (alarm) {
      setEditingAlarm(alarm)
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

  const tableData: AlarmTableData[] =
    data?.data.map((alarm) => ({
      ...alarm,
      onEdit: handleEdit,
      onDelete: handleDelete,
      onToggleStatus: handleToggleStatus,
    })) || []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Alarm</h1>
          <p className="text-muted-foreground">
            Manage alarm configurations
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Alarm
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by alarm type..."
              className="pl-8"
              value={filters.alarm_type || ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  alarm_type: e.target.value || null,
                  page: 1,
                })
              }
            />
          </div>
        </div>
        <Select
          value={
            filters.is_enabled === null
              ? "all"
              : filters.is_enabled
                ? "enabled"
                : "disabled"
          }
          onValueChange={(value) =>
            setFilters({
              ...filters,
              is_enabled:
                value === "all" ? null : value === "enabled" ? true : false,
              page: 1,
            })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="enabled">Enabled</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* DataTable */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading...
        </div>
      ) : (
        <DataTable columns={alarmColumns} data={tableData} />
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
      <AlarmFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) {
            setEditingAlarm(null)
          }
        }}
        alarm={editingAlarm}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Alarm</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this alarm? This action cannot be
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
