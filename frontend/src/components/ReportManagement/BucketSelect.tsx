import { useQuery } from "@tanstack/react-query"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ReportModuleService } from "@/services/report"

export function BucketSelect({
  datasourceId,
  value,
  onChange,
  placeholder = "Select bucket",
}: {
  datasourceId?: string
  value: string
  onChange: (val: string) => void
  placeholder?: string
}) {
  const disabled = !datasourceId
  const { data: buckets, isLoading } = useQuery({
    queryKey: ["minio-buckets", datasourceId],
    queryFn: () => ReportModuleService.listBuckets(datasourceId!),
    enabled: !disabled,
  })

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue
          placeholder={
            disabled
              ? "Select datasource first"
              : isLoading
                ? "Loading buckets..."
                : placeholder
          }
        />
      </SelectTrigger>
      {!disabled && (
        <SelectContent>
          {(buckets ?? []).map((b) => (
            <SelectItem key={b} value={b}>
              {b}
            </SelectItem>
          ))}
          {buckets && buckets.length === 0 && (
            <SelectItem value="_none" disabled>
              No buckets found
            </SelectItem>
          )}
        </SelectContent>
      )}
    </Select>
  )
}
