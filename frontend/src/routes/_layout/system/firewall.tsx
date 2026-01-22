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
  firewallColumns,
  type FirewallTableData,
} from "@/components/System/firewall-columns"
import { FirewallFormDialog } from "@/components/System/FirewallFormDialog"
import {
  FirewallService,
  type FirewallRuleListIn,
  type FirewallRulePublic,
  type FirewallRuleTypeEnum,
} from "@/services/firewall"
import useCustomToast from "@/hooks/useCustomToast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export const Route = createFileRoute("/_layout/system/firewall")({
  component: FirewallPage,
  head: () => ({
    meta: [
      {
        title: "Firewall - System",
      },
    ],
  }),
})

function FirewallPage() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // Filters state
  const [filters, setFilters] = useState<FirewallRuleListIn>({
    page: 1,
    page_size: 20,
    rule_type: null,
    is_active: null,
  })

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<FirewallRulePublic | null>(
    null,
  )

  // Query for list
  const { data, isLoading } = useQuery({
    queryKey: ["firewall", filters],
    queryFn: () => FirewallService.list(filters),
  })

  // Delete mutation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => FirewallService.delete(id),
    onSuccess: () => {
      showSuccessToast("Firewall rule deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["firewall"] })
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
      return FirewallService.update({
        id,
        is_active: !currentStatus,
      })
    },
    onSuccess: (updated) => {
      if (updated.is_active) {
        showSuccessToast("Firewall rule activated successfully")
      } else {
        showErrorToast("Firewall rule has been deactivated", "Deactivated")
      }
      queryClient.invalidateQueries({ queryKey: ["firewall"] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const handleCreate = () => {
    setEditingRule(null)
    setIsFormOpen(true)
  }

  const handleEdit = (id: string) => {
    const rule = data?.data.find((r) => r.id === id)
    if (rule) {
      setEditingRule(rule)
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

  const tableData: FirewallTableData[] =
    data?.data.map((rule) => ({
      ...rule,
      onEdit: handleEdit,
      onDelete: handleDelete,
      onToggleStatus: handleToggleStatus,
    })) || []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Firewall</h1>
          <p className="text-muted-foreground">
            Manage firewall rules for IP allow/deny
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Rule
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Select
          value={filters.rule_type || "all"}
          onValueChange={(value) =>
            setFilters({
              ...filters,
              rule_type:
                value === "all"
                  ? null
                  : (value as FirewallRuleTypeEnum),
              page: 1,
            })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="allow">Allow</SelectItem>
            <SelectItem value="deny">Deny</SelectItem>
          </SelectContent>
        </Select>
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
        <DataTable columns={firewallColumns} data={tableData} />
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
      <FirewallFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) {
            setEditingRule(null)
          }
        }}
        rule={editingRule}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Firewall Rule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this firewall rule? This action
              cannot be undone.
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
