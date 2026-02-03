import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useMatchRoute } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import { GitBranch, RotateCcw, Trash2, User } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import ApiContentEditor from "@/components/ApiDev/ApiContentEditor"
import MacroExamples from "@/components/ApiDev/MacroExamples"
import { MacroDefsService, type ApiMacroDefDetail, type MacroDefVersionCommitPublic, type MacroDefVersionCommitDetail } from "@/services/macro-defs"
import { ModulesService } from "@/services/modules"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import { usePermissions } from "@/hooks/usePermissions"

export const Route = createFileRoute("/_layout/api-dev/macro-defs/$id")({
  component: MacroDetail,
  loader: async ({ params }) => {
    const macro = await MacroDefsService.get(params.id)
    return { macro }
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.macro?.name
          ? `Macro definition: ${loaderData.macro.name}`
          : "Macro definition",
      },
    ],
  }),
})

function MacroDetail() {
  const { id } = Route.useParams()
  const matchRoute = useMatchRoute()
  const isEditRoute = matchRoute({ to: "/api-dev/macro-defs/$id/edit" })
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { hasPermission } = usePermissions()
  const canUpdate = hasPermission("macro_def", "update", id)
  const canDelete = hasPermission("macro_def", "delete", id)

  const [versions, setVersions] = useState<MacroDefVersionCommitPublic[]>([])
  const [selectedVersion, setSelectedVersion] = useState<MacroDefVersionCommitDetail | null>(null)
  const [createVersionDialogOpen, setCreateVersionDialogOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState("")
  const [publishVersionDialogOpen, setPublishVersionDialogOpen] = useState(false)
  const [selectedVersionForPublish, setSelectedVersionForPublish] = useState<string | null>(null)
  const [deleteVersionDialogOpen, setDeleteVersionDialogOpen] = useState(false)
  const [versionToDelete, setVersionToDelete] = useState<string | null>(null)
  const [restoreVersionDialogOpen, setRestoreVersionDialogOpen] = useState(false)
  const [versionToRestore, setVersionToRestore] = useState<string | null>(null)

  const { data: macro, isLoading } = useQuery({
    queryKey: ["macro", id],
    queryFn: () => MacroDefsService.get(id),
  })

  const { data: versionsData, refetch: refetchVersions } = useQuery({
    queryKey: ["macro-versions", id],
    queryFn: () => MacroDefsService.listVersions(id),
    enabled: !!id && !isEditRoute,
  })

  useEffect(() => {
    if (versionsData?.data) setVersions(versionsData.data)
  }, [versionsData])

  // When Publish dialog opens, set default selected version so the form is valid immediately
  useEffect(() => {
    if (publishVersionDialogOpen && versions.length > 0) {
      setSelectedVersionForPublish(
        (prev) =>
          prev ||
          macro?.published_version_id ||
          versions[0]?.id ||
          null,
      )
    }
  }, [publishVersionDialogOpen, versions, macro?.published_version_id])

  const { data: modules } = useQuery({
    queryKey: ["modules-simple"],
    queryFn: () => ModulesService.listSimple(),
  })

  const createVersionMutation = useMutation({
    mutationFn: () =>
      MacroDefsService.createVersion(id, { commit_message: commitMessage || null }),
    onSuccess: () => {
      showSuccessToast("Version created successfully")
      setCreateVersionDialogOpen(false)
      setCommitMessage("")
      queryClient.invalidateQueries({ queryKey: ["macro", id] })
      refetchVersions()
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  const deleteVersionMutation = useMutation({
    mutationFn: () => {
      if (!versionToDelete) throw new Error("No version selected")
      return MacroDefsService.deleteVersion(versionToDelete)
    },
    onSuccess: () => {
      showSuccessToast("Version deleted successfully")
      setDeleteVersionDialogOpen(false)
      setVersionToDelete(null)
      queryClient.invalidateQueries({ queryKey: ["macro", id] })
      refetchVersions()
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  const restoreVersionMutation = useMutation({
    mutationFn: (versionId: string) => MacroDefsService.restoreVersion(id, versionId),
    onSuccess: () => {
      showSuccessToast("Macro content restored from version successfully")
      setRestoreVersionDialogOpen(false)
      setVersionToRestore(null)
      setSelectedVersion(null)
      queryClient.invalidateQueries({ queryKey: ["macro", id] })
      refetchVersions()
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  const publishMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersionForPublish) throw new Error("Please select a version to publish")
      return MacroDefsService.publish({ id, version_id: selectedVersionForPublish })
    },
    onSuccess: () => {
      showSuccessToast("Macro published successfully")
      setPublishVersionDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ["macro", id] })
      refetchVersions()
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  const unpublishMutation = useMutation({
    mutationFn: () => MacroDefsService.unpublish({ id }),
    onSuccess: () => {
      showSuccessToast("Macro unpublished successfully")
      queryClient.invalidateQueries({ queryKey: ["macro", id] })
      refetchVersions()
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  const handlePublish = () => {
    if (versions.length === 0) {
      showErrorToast("Please create at least one version before publishing")
      return
    }
    setSelectedVersionForPublish(
      macro?.published_version_id ?? versions[0]?.id ?? null,
    )
    setPublishVersionDialogOpen(true)
  }

  const handleDeleteVersion = (versionId: string) => {
    if (macro?.published_version_id === versionId) {
      showErrorToast("Cannot delete published version. Unpublish or publish another version first.")
      return
    }
    setVersionToDelete(versionId)
    setDeleteVersionDialogOpen(true)
  }

  const handleRestoreVersion = (versionId: string) => {
    setVersionToRestore(versionId)
    setRestoreVersionDialogOpen(true)
  }

  const moduleName =
    macro?.module_id && modules
      ? modules.find((m) => m.id === macro.module_id)?.name ?? "—"
      : "Global"

  if (isLoading || !macro) {
    return (
      <div className="flex flex-col gap-6">
        <div>Loading...</div>
      </div>
    )
  }

  if (isEditRoute) {
    return <Outlet />
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{macro.name}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant={macro.macro_type === "JINJA" ? "secondary" : "outline"}>
              {macro.macro_type}
            </Badge>
            <Badge variant={macro.is_published ? "default" : "outline"}>
              {macro.is_published ? "Published" : "Draft"}
            </Badge>
            <span className="text-muted-foreground text-sm">
              Scope: {moduleName}
            </span>
            {(macro as ApiMacroDefDetail).used_by_apis_count > 0 && (
              <span className="text-muted-foreground text-sm">
                · Used by {(macro as ApiMacroDefDetail).used_by_apis_count} API(s)
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {macro.is_published ? (
            <Button
              variant="outline"
              onClick={() => unpublishMutation.mutate()}
              disabled={unpublishMutation.isPending}
            >
              Unpublish
            </Button>
          ) : (
            <Button
              onClick={handlePublish}
              disabled={publishMutation.isPending || versions.length === 0}
            >
              Publish
            </Button>
          )}
          {canUpdate && (
            <Link to="/api-dev/macro-defs/$id/edit" params={{ id }}>
              <Button variant="outline">Edit</Button>
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{macro.name}</CardTitle>
          <CardDescription>{macro.description || "View and manage macro content"}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="content" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="versions">Versions</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="space-y-6 mt-6">
              <div className="rounded-md border overflow-hidden bg-muted/30">
                <ApiContentEditor
                  executeEngine={
                    macro.macro_type === "JINJA" ? "SQL" : "SCRIPT"
                  }
                  value={macro.content}
                  onChange={() => {}}
                  disabled
                  height={Math.min(300, (macro.content.split("\n").length || 1) * 22)}
                  autoHeight
                />
              </div>
              <MacroExamples />
            </TabsContent>

            <TabsContent value="versions" className="mt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Manage versions of macro content
                  </p>
                  <Button
                    onClick={() => setCreateVersionDialogOpen(true)}
                    disabled={!macro?.content}
                  >
                    <GitBranch className="mr-2 h-4 w-4" />
                    Create Version
                  </Button>
                </div>
                {versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No versions yet. Create a version to track changes.
                  </p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Version</TableHead>
                          <TableHead>Commit Message</TableHead>
                          <TableHead>Created By</TableHead>
                          <TableHead>Committed At</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {versions.map((version) => (
                          <TableRow key={version.id}>
                            <TableCell className="font-mono font-semibold">v{version.version}</TableCell>
                            <TableCell>
                              {version.commit_message || (
                                <span className="text-muted-foreground italic">No message</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {version.committed_by_email ? (
                                <div className="flex items-center gap-2">
                                  <User className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">{version.committed_by_email}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(version.committed_at).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {macro?.published_version_id === version.id ? (
                                <Badge variant="default">Published</Badge>
                              ) : (
                                <Badge variant="outline">Draft</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      const detail = await MacroDefsService.getVersion(version.id)
                                      setSelectedVersion(detail)
                                    } catch (error) {
                                      showErrorToast(error instanceof Error ? error.message : "Failed to load")
                                    }
                                  }}
                                >
                                  View
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRestoreVersion(version.id)}
                                  title="Restore this version into current content"
                                >
                                  <RotateCcw className="mr-1 h-4 w-4" />
                                  Restore
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteVersion(version.id)}
                                  disabled={!canDelete || macro?.published_version_id === version.id}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Link to="/api-dev/macro-defs">
          <Button variant="outline">Back to Macro definitions</Button>
        </Link>
      </div>

      <Dialog open={createVersionDialogOpen} onOpenChange={setCreateVersionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Version</DialogTitle>
            <DialogDescription>
              Create a new version snapshot of the current macro content.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="commit-message">Commit message (optional)</Label>
              <Input
                id="commit-message"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Describe the changes..."
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={createVersionMutation.isPending} onClick={() => setCreateVersionDialogOpen(false)}>
              Cancel
            </Button>
            <LoadingButton onClick={() => createVersionMutation.mutate()} loading={createVersionMutation.isPending}>
              Create Version
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={publishVersionDialogOpen}
        onOpenChange={(open) => {
          setPublishVersionDialogOpen(open)
          if (!open) setSelectedVersionForPublish(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish macro definition</DialogTitle>
            <DialogDescription>Select a version to publish.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Select Version *</Label>
              <Select
                value={selectedVersionForPublish ?? ""}
                onValueChange={(v) => setSelectedVersionForPublish(v)}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select a version" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      v{v.version} - {v.commit_message || "No message"}
                      {macro?.published_version_id === v.id && " (Current)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={publishMutation.isPending} onClick={() => setPublishVersionDialogOpen(false)}>
              Cancel
            </Button>
            <LoadingButton
              onClick={() => publishMutation.mutate()}
              loading={publishMutation.isPending}
              disabled={!selectedVersionForPublish}
            >
              Publish
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteVersionDialogOpen} onOpenChange={setDeleteVersionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Version</DialogTitle>
            <DialogDescription>Are you sure you want to delete this version?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deleteVersionMutation.isPending} onClick={() => setDeleteVersionDialogOpen(false)}>
              Cancel
            </Button>
            <LoadingButton variant="destructive" onClick={() => deleteVersionMutation.mutate()} loading={deleteVersionMutation.isPending}>
              Delete
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restoreVersionDialogOpen} onOpenChange={(open) => { setRestoreVersionDialogOpen(open); if (!open) setVersionToRestore(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Version</DialogTitle>
            <DialogDescription>
              Restore this version? Current content will be overwritten.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={restoreVersionMutation.isPending} onClick={() => setRestoreVersionDialogOpen(false)}>
              Cancel
            </Button>
            <LoadingButton
              onClick={() => versionToRestore && restoreVersionMutation.mutate(versionToRestore)}
              loading={restoreVersionMutation.isPending}
              disabled={!versionToRestore}
            >
              Restore
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedVersion} onOpenChange={() => setSelectedVersion(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Version {selectedVersion?.version}</DialogTitle>
            <DialogDescription>{selectedVersion?.commit_message || "No commit message"}</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border overflow-hidden mt-4">
            <ApiContentEditor
              executeEngine={macro?.macro_type === "JINJA" ? "SQL" : "SCRIPT"}
              value={selectedVersion?.content_snapshot ?? ""}
              onChange={() => {}}
              disabled
              height={200}
              autoHeight
            />
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Committed: {selectedVersion ? new Date(selectedVersion.committed_at).toLocaleString() : ""}
            {selectedVersion?.committed_by_email && ` by ${selectedVersion.committed_by_email}`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedVersion(null)}>Close</Button>
            {selectedVersion && (
              <Button onClick={() => handleRestoreVersion(selectedVersion.id)}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Restore this version
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
