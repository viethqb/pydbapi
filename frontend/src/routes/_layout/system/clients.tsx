import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search, Copy, Check } from "lucide-react"
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
  clientsColumns,
  type ClientTableData,
} from "@/components/System/clients-columns"
import { ClientFormDialog } from "@/components/System/ClientFormDialog"
import {
  ClientsService,
  type AppClientListIn,
  type AppClientPublic,
} from "@/services/clients"
import useCustomToast from "@/hooks/useCustomToast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"

export const Route = createFileRoute("/_layout/system/clients")({
  component: ClientsPage,
  head: () => ({
    meta: [
      {
        title: "Clients - System",
      },
    ],
  }),
})

function ClientsPage() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [copiedText, copyToClipboard] = useCopyToClipboard()

  // Filters state
  const [filters, setFilters] = useState<AppClientListIn>({
    page: 1,
    page_size: 20,
    name__ilike: null,
    is_active: null,
  })

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<AppClientPublic | null>(
    null,
  )

  // Regenerate secret dialog state
  const [regeneratedSecret, setRegeneratedSecret] = useState<{
    clientId: string
    secret: string
  } | null>(null)

  // Query for list
  const { data, isLoading } = useQuery({
    queryKey: ["clients", filters],
    queryFn: () => ClientsService.list(filters),
  })

  // Delete mutation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => ClientsService.delete(id),
    onSuccess: () => {
      showSuccessToast("Client deleted successfully")
      queryClient.invalidateQueries({ queryKey: ["clients"] })
      setDeleteId(null)
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
      setDeleteId(null)
    },
  })

  // Regenerate secret mutation
  const regenerateSecretMutation = useMutation({
    mutationFn: (id: string) => ClientsService.regenerateSecret(id),
    onSuccess: (result, id) => {
      setRegeneratedSecret({
        clientId: id,
        secret: result.client_secret,
      })
      showSuccessToast("Client secret regenerated successfully")
      queryClient.invalidateQueries({ queryKey: ["clients"] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
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
      return ClientsService.update({
        id,
        is_active: !currentStatus,
      })
    },
    onSuccess: (updated) => {
      if (updated.is_active) {
        showSuccessToast("Client activated successfully")
      } else {
        showErrorToast("Client has been deactivated", "Deactivated")
      }
      queryClient.invalidateQueries({ queryKey: ["clients"] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message)
    },
  })

  const handleCreate = () => {
    setEditingClient(null)
    setIsFormOpen(true)
  }

  const handleEdit = (id: string) => {
    const client = data?.data.find((c) => c.id === id)
    if (client) {
      setEditingClient(client)
      setIsFormOpen(true)
    }
  }

  const handleDelete = (id: string) => {
    setDeleteId(id)
  }

  const handleRegenerateSecret = (id: string) => {
    regenerateSecretMutation.mutate(id)
  }

  const handleToggleStatus = (id: string, currentStatus: boolean) => {
    toggleStatusMutation.mutate({ id, currentStatus })
  }

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId)
    }
  }

  const handleCopySecret = async () => {
    if (regeneratedSecret) {
      const success = await copyToClipboard(regeneratedSecret.secret)
      if (success) {
        showSuccessToast("Secret copied to clipboard")
      }
    }
  }

  const tableData: ClientTableData[] =
    data?.data.map((client) => ({
      ...client,
      onEdit: handleEdit,
      onDelete: handleDelete,
      onRegenerateSecret: handleRegenerateSecret,
      onToggleStatus: handleToggleStatus,
    })) || []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-muted-foreground">
            Manage application clients and credentials
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Client
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
        <DataTable columns={clientsColumns} data={tableData} />
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
      <ClientFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) {
            setEditingClient(null)
          }
        }}
        client={editingClient}
      />

      {/* Regenerate Secret Dialog */}
      <Dialog
        open={regeneratedSecret !== null}
        onOpenChange={() => setRegeneratedSecret(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Client Secret Regenerated</DialogTitle>
            <DialogDescription>
              Save this secret now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2">
              <Input
                value={regeneratedSecret?.secret || ""}
                readOnly
                className="font-mono"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopySecret}
              >
                {copiedText === regeneratedSecret?.secret ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setRegeneratedSecret(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Client</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this client? This action cannot be
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
