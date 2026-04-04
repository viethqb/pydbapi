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
  const { data: files, isLoading } = useQuery({
    queryKey: ["minio-files", datasourceId, bucket],
    queryFn: () => ReportModuleService.listFiles(datasourceId!, bucket!),
    enabled: !!datasourceId && !!bucket,
  })

  if (!datasourceId || !bucket) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Select bucket first" />
        </SelectTrigger>
      </Select>
    )
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? "Loading..." : placeholder} />
      </SelectTrigger>
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
    </Select>
  )
}
