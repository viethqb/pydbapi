import { useQuery } from "@tanstack/react-query"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ReportModuleService } from "@/services/report"

export function SheetSelect({
  datasourceId,
  bucket,
  filePath,
  value,
  onChange,
  placeholder = "Select sheet",
  allowEmpty = true,
}: {
  datasourceId?: string
  bucket?: string
  filePath?: string
  value: string
  onChange: (val: string) => void
  placeholder?: string
  allowEmpty?: boolean
}) {
  const { data: sheets, isLoading } = useQuery({
    queryKey: ["excel-sheets", datasourceId, bucket, filePath],
    queryFn: () => ReportModuleService.listSheets(datasourceId!, bucket!, filePath!),
    enabled: !!datasourceId && !!bucket && !!filePath,
  })

  if (!datasourceId || !bucket || !filePath) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Select template file first" />
        </SelectTrigger>
      </Select>
    )
  }

  return (
    <Select value={value || "_empty"} onValueChange={(v) => onChange(v === "_empty" ? "" : v)}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? "Loading..." : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && (
          <SelectItem value="_empty">
            <span className="text-muted-foreground">Full file (no extraction)</span>
          </SelectItem>
        )}
        {(sheets ?? []).map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
        {sheets && sheets.length === 0 && (
          <SelectItem value="_no_sheets" disabled>
            No sheets found
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  )
}
