import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ReportModuleService } from "@/services/report"

export function SheetSelect({
  datasourceId,
  bucket,
  filePath,
  value,
  onChange,
}: {
  datasourceId?: string
  bucket?: string
  filePath?: string
  value: string
  onChange: (val: string) => void
}) {
  const { data: sheets, isLoading } = useQuery({
    queryKey: ["excel-sheets", datasourceId, bucket, filePath],
    queryFn: () =>
      ReportModuleService.listSheets(datasourceId!, bucket!, filePath!),
    enabled: !!datasourceId && !!bucket && !!filePath,
  })

  const selected = new Set(
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  )

  const toggle = (sheet: string, checked: boolean) => {
    const next = new Set(selected)
    if (checked) {
      next.add(sheet)
    } else {
      next.delete(sheet)
    }
    onChange(Array.from(next).join(","))
  }

  if (!datasourceId || !bucket || !filePath) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a template file first
      </p>
    )
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading sheets...</p>
  }

  if (!sheets || sheets.length === 0) {
    return <p className="text-sm text-muted-foreground">No sheets found</p>
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {sheets.map((s) => (
          <label key={s} className="flex items-center gap-1.5 text-sm">
            <Checkbox
              checked={selected.has(s)}
              onCheckedChange={(c) => toggle(s, c === true)}
            />
            {s}
          </label>
        ))}
      </div>
      {selected.size > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Selected:</span>
          {Array.from(selected).map((s) => (
            <Badge key={s} variant="secondary" className="text-xs">
              {s}
            </Badge>
          ))}
        </div>
      )}
      {selected.size === 0 && (
        <p className="text-xs text-muted-foreground">
          No sheets selected — full file will be returned (no extraction)
        </p>
      )}
    </div>
  )
}
