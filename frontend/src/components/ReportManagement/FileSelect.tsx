import { useQuery } from "@tanstack/react-query"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ReportModuleService } from "@/services/report"

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

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
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
