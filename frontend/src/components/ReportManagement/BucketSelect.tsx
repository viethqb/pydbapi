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

/**
 * Dropdown that lists MinIO buckets from a datasource.
 * Falls back to text input if datasourceId is not provided.
 */
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
  const { data: buckets, isLoading } = useQuery({
    queryKey: ["minio-buckets", datasourceId],
    queryFn: () => ReportModuleService.listBuckets(datasourceId!),
    enabled: !!datasourceId,
  })

  if (!datasourceId) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    )
  }

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Loading buckets..." />
        </SelectTrigger>
      </Select>
    )
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
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
    </Select>
  )
}
