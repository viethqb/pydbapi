import { useQuery } from "@tanstack/react-query"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ReportModuleService } from "@/services/report"

// Radix Select doesn't accept empty-string values. Use a sentinel to represent
// "no template file" (blank workbook) and convert on the boundary.
const BLANK_SENTINEL = "__blank__"

export function FileSelect({
  datasourceId,
  bucket,
  value,
  onChange,
  placeholder = "Select file",
}: {
  datasourceId?: string
  bucket?: string
  value: string
  onChange: (val: string) => void
  placeholder?: string
}) {
  const disabled = !datasourceId || !bucket
  const { data: files, isLoading } = useQuery({
    queryKey: ["minio-files", datasourceId, bucket],
    queryFn: () => ReportModuleService.listFiles(datasourceId!, bucket!),
    enabled: !disabled,
  })

  const selectValue = value ? value : BLANK_SENTINEL

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => onChange(v === BLANK_SENTINEL ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue
          placeholder={
            disabled
              ? "Select bucket first"
              : isLoading
                ? "Loading..."
                : placeholder
          }
        />
      </SelectTrigger>
      {!disabled && (
        <SelectContent>
          <SelectItem value={BLANK_SENTINEL}>
            <span className="flex flex-col">
              <span className="font-medium">Blank workbook</span>
              <span className="text-xs text-muted-foreground">
                No template file — sheets are created from mappings
              </span>
            </span>
          </SelectItem>
          {files && files.length > 0 ? <SelectSeparator /> : null}
          {(files ?? []).map((f) => (
            <SelectItem key={f} value={f}>
              {f}
            </SelectItem>
          ))}
          {files && files.length === 0 && (
            <SelectItem value="_none" disabled>
              No .xlsx files found
            </SelectItem>
          )}
        </SelectContent>
      )}
    </Select>
  )
}
