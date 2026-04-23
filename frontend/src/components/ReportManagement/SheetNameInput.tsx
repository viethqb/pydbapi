import { useQuery } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ReportModuleService } from "@/services/report"

type SheetNameInputProps = {
  /** Current sheet name. */
  value: string
  onChange: (value: string) => void
  /** MinIO datasource id of the template's module. */
  datasourceId?: string | null
  /** Bucket that hosts the xlsx template. */
  bucket?: string | null
  /** Template file object path. Empty/null means blank-workbook mode. */
  filePath?: string | null
  placeholder?: string
}

/**
 * Sheet name picker that adapts to the template's storage state:
 *
 * - If the template points to a concrete xlsx file, fetch its sheet names
 *   and render a dropdown limited to those real sheets.
 * - If the template uses a blank workbook (no file path), render a plain
 *   text input — the executor creates whichever sheet the user types.
 */
export function SheetNameInput({
  value,
  onChange,
  datasourceId,
  bucket,
  filePath,
  placeholder = "e.g. Sheet1",
}: SheetNameInputProps) {
  const hasFile = !!datasourceId && !!bucket && !!filePath
  const { data: sheets, isLoading } = useQuery({
    queryKey: ["excel-sheets", datasourceId, bucket, filePath],
    queryFn: () =>
      ReportModuleService.listSheets(datasourceId!, bucket!, filePath!),
    enabled: hasFile,
  })

  if (!hasFile) {
    return (
      <div className="flex flex-col gap-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <p className="text-xs text-muted-foreground">
          No template file set — a blank workbook will be created and this sheet
          will be added to it.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return <Input value={value} disabled placeholder="Loading sheets..." />
  }

  const options = sheets ?? []
  const isCurrentInList = options.includes(value)
  // When value is stale (e.g. sheet was renamed), leave the Select empty so
  // the placeholder nudges the user to pick again, and surface the old value
  // as a hint below.
  const selectValue = isCurrentInList ? value : ""

  return (
    <div className="flex flex-col gap-1">
      <Select value={selectValue} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Select a sheet" />
        </SelectTrigger>
        <SelectContent>
          {options.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && !isCurrentInList ? (
        <p className="text-xs text-destructive">
          Current value <span className="font-mono">{value}</span> is not in the
          template — pick a valid sheet.
        </p>
      ) : null}
    </div>
  )
}
