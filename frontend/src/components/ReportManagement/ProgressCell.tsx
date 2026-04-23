type ProgressCellProps = {
  status: string
  progressPct?: number | null
  processedRows?: number | null
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-muted">
      <div
        className="h-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/**
 * Compact in-table progress display for a single ReportExecution.
 *
 * - pending/failed: shows a dash (progress is not meaningful).
 * - running: shows a progress bar using progressPct (0–100) and the
 *   cumulative processed_rows counter.
 * - success: shows final row count.
 */
export function ProgressCell({
  status,
  progressPct,
  processedRows,
}: ProgressCellProps) {
  if (status === "pending") {
    return <span className="text-muted-foreground text-sm">queued</span>
  }
  if (status === "failed") {
    return <span className="text-muted-foreground text-sm">--</span>
  }

  const pct = typeof progressPct === "number" ? progressPct : 0
  const rows = typeof processedRows === "number" ? processedRows : 0

  if (status === "success") {
    return (
      <span className="text-sm tabular-nums">{rows.toLocaleString()} rows</span>
    )
  }

  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
      <ProgressBar value={pct} />
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{pct}%</span>
        <span>{rows.toLocaleString()} rows</span>
      </div>
    </div>
  )
}
