import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import type { RequestsByDayPoint } from "@/services/overview"

function formatDayLabel(day: string) {
  // day is expected to be YYYY-MM-DD
  return day.slice(5)
}

export function RequestsByDayChart(props: {
  requestsByDay: RequestsByDayPoint[]
  isLoading?: boolean
  requestsDays?: number
  onRequestsDaysChange?: (days: number) => void
}) {
  const {
    requestsByDay,
    isLoading,
    requestsDays = 14,
    onRequestsDaysChange,
  } = props

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Requests by day</CardTitle>
        <Select
          value={String(requestsDays)}
          onValueChange={(value) => {
            const days = Number.parseInt(value, 10)
            if (!Number.isNaN(days) && onRequestsDaysChange) {
              onRequestsDaysChange(days)
            }
          }}
        >
          <SelectTrigger className="w-[140px]" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Today</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-60 w-full" />
        ) : requestsByDay.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No request data yet.
          </div>
        ) : (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={requestsByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="day"
                  tickFormatter={formatDayLabel}
                  minTickGap={16}
                />
                <YAxis allowDecimals={false} />
                <Tooltip
                  labelFormatter={(label) => `Day: ${label}`}
                  formatter={(value) => [value, "Requests"]}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
