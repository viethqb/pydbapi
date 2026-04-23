import { useMutation } from "@tanstack/react-query"
import { AlertCircle, FileSearch } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  type MappingPreviewOut,
  ReportModuleService,
  type ReportPreviewOut,
} from "@/services/report"

type PreviewDialogProps = {
  moduleId: string
  templateId: string
  parameters?: Record<string, unknown>
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Dry-run preview dialog. Calls the /preview endpoint, which renders each
 * sheet mapping's SQL and returns up to N rows — without generating or
 * uploading an xlsx. Used to catch broken SQL/parameters before paying the
 * cost of a full generate.
 */
export function PreviewDialog({
  moduleId,
  templateId,
  parameters,
  open,
  onOpenChange,
}: PreviewDialogProps) {
  const [result, setResult] = useState<ReportPreviewOut | null>(null)

  const previewMutation = useMutation({
    mutationFn: () =>
      ReportModuleService.preview(moduleId, templateId, {
        parameters,
        row_limit: 5,
      }),
    onSuccess: (data) => setResult(data),
  })

  // Auto-fetch on open→true transition; reset on close. The mutation and
  // result refs are stable across renders, so we only need to react to `open`.
  const mutateRef = useRef(previewMutation.mutate)
  mutateRef.current = previewMutation.mutate
  const resetRef = useRef(previewMutation.reset)
  resetRef.current = previewMutation.reset

  useEffect(() => {
    if (open) {
      setResult(null)
      mutateRef.current()
    } else {
      setResult(null)
      resetRef.current()
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl w-full max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5" />
            Template Preview
          </DialogTitle>
          <DialogDescription>
            Dry-run of each sheet mapping using the current parameters. No file
            is generated or uploaded.
          </DialogDescription>
        </DialogHeader>

        {previewMutation.isPending ? (
          <div className="py-10 text-center text-muted-foreground">
            Running SQL for each mapping...
          </div>
        ) : previewMutation.isError ? (
          <div className="py-6 text-destructive text-sm flex items-start gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Preview failed</p>
              <p className="font-mono text-xs whitespace-pre-wrap">
                {String(previewMutation.error)}
              </p>
            </div>
          </div>
        ) : result ? (
          <div className="space-y-6">
            {result.mappings.length === 0 ? (
              <p className="text-muted-foreground">No active mappings.</p>
            ) : (
              result.mappings.map((m) => (
                <MappingPreviewCard key={m.mapping_id} mapping={m} />
              ))
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <LoadingButton
            loading={previewMutation.isPending}
            onClick={() => {
              setResult(null)
              previewMutation.mutate()
            }}
          >
            Refresh
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MappingPreviewCard({ mapping }: { mapping: MappingPreviewOut }) {
  return (
    <div className="rounded-md border overflow-hidden">
      <div className="bg-muted/50 px-3 py-2 flex items-center justify-between text-sm">
        <div>
          <span className="font-medium">{mapping.sheet_name}</span>
          <span className="text-muted-foreground ml-2">
            @ <span className="font-mono">{mapping.start_cell}</span>
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {mapping.rows.length} rows × {mapping.columns.length} cols
        </span>
      </div>

      {mapping.error ? (
        <div className="p-3 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="font-mono text-xs whitespace-pre-wrap">
            {mapping.error}
          </span>
        </div>
      ) : mapping.rows.length === 0 ? (
        <div className="p-3 text-sm text-muted-foreground">
          Query returned no rows.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {mapping.columns.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {mapping.rows.map((row, idx) => (
                <TableRow key={idx}>
                  {mapping.columns.map((c) => (
                    <TableCell key={c} className="font-mono text-xs">
                      {formatCellValue(row[c])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function formatCellValue(v: unknown): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}
