import { useState } from "react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import type { StatusBreakdownOut } from "@/services/overview"

const STATUS_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
]

export function StatusBreakdownChart(props: {
  data?: StatusBreakdownOut
  isLoading?: boolean
  days?: number
  onDaysChange?: (days: number) => void
}) {
  const { data, isLoading, days: daysProp, onDaysChange } = props
  const [localDays, setLocalDays] = useState(String(daysProp ?? 7))

  const handleDaysChange = (value: string) => {
    setLocalDays(value)
    const d = Number.parseInt(value, 10)
    if (!Number.isNaN(d) && onDaysChange) {
      onDaysChange(d)
    }
  }

  const successCount =
    data?.by_status
      .filter((s) => s.category === "2xx" || s.category === "3xx")
      .reduce((sum, s) => sum + s.count, 0) ?? 0
  const successRate =
    data && data.total > 0
      ? ((successCount / data.total) * 100).toFixed(1)
      : null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Status breakdown</CardTitle>
        <Select value={localDays} onValueChange={handleDaysChange}>
          <SelectTrigger className="w-[140px]" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Today</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-52 w-full" />
        ) : !data || data.total === 0 ? (
          <div className="text-sm text-muted-foreground">
            No request data yet.
          </div>
        ) : (
          <div className="flex items-center gap-6">
            <div className="h-52 w-52 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.by_status}
                    dataKey="count"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {data.by_status.map((_, index) => (
                      <Cell
                        key={data.by_status[index].category}
                        fill={STATUS_COLORS[index % STATUS_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [
                      Number(value).toLocaleString(),
                      name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Total requests</span>
                <p className="text-xl font-semibold tabular-nums">
                  {data.total.toLocaleString()}
                </p>
              </div>
              {data.avg_duration_ms != null && (
                <div>
                  <span className="text-muted-foreground">
                    Avg response time
                  </span>
                  <p className="text-xl font-semibold tabular-nums">
                    {data.avg_duration_ms} ms
                  </p>
                </div>
              )}
              {successRate != null && (
                <div>
                  <span className="text-muted-foreground">Success rate</span>
                  <p className="text-xl font-semibold tabular-nums">
                    {successRate}%
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-1">
                {data.by_status.map((s, i) => (
                  <div key={s.category} className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          STATUS_COLORS[i % STATUS_COLORS.length],
                      }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {s.category}: {s.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
