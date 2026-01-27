import { useEffect, useState } from "react"
import {
  Bar,
  BarChart,
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
import type { RequestsByDayPoint, TopPathPoint } from "@/services/overview"

function formatDayLabel(day: string) {
  // day is expected to be YYYY-MM-DD
  return day.slice(5)
}

export function DashboardCharts(props: {
  requestsByDay: RequestsByDayPoint[]
  topPaths: TopPathPoint[]
  isLoading?: boolean
  requestsDays?: number
  onRequestsDaysChange?: (days: number) => void
  topPathsLimit?: number
  onTopPathsLimitChange?: (limit: number) => void
}) {
  const {
    requestsByDay,
    topPaths,
    isLoading,
    requestsDays = 14,
    onRequestsDaysChange,
    topPathsLimit = 10,
    onTopPathsLimitChange,
  } = props
  const [localLimit, setLocalLimit] = useState(String(topPathsLimit))

  useEffect(() => {
    setLocalLimit(String(topPathsLimit))
  }, [topPathsLimit])

  return (
    <div className="grid gap-6 lg:grid-cols-2">
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
                    stroke="currentColor"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Top paths</CardTitle>
          <Select
            value={localLimit}
            onValueChange={(value) => {
              setLocalLimit(value)
              const limit = Number.parseInt(value, 10)
              if (!Number.isNaN(limit) && onTopPathsLimitChange) {
                onTopPathsLimitChange(limit)
              }
            }}
          >
            <SelectTrigger className="w-[100px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">Top 5</SelectItem>
              <SelectItem value="10">Top 10</SelectItem>
              <SelectItem value="15">Top 15</SelectItem>
              <SelectItem value="20">Top 20</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-60 w-full" />
          ) : topPaths.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No request data yet.
            </div>
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topPaths}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="path"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    height={80}
                    angle={0}
                    textAnchor="middle"
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(value) => [value, "Requests"]} />
                  <Bar dataKey="count" fill="currentColor" barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
