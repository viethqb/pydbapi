import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { ErrorBoundary } from "@/components/Common/ErrorBoundary"
import { RequestsByDayChart } from "@/components/Dashboard/DashboardCharts"
import { RecentAccessTable } from "@/components/Dashboard/RecentAccessTable"
import { RecentCommitsTable } from "@/components/Dashboard/RecentCommitsTable"
import { StatsCards } from "@/components/Dashboard/StatsCards"
import { StatusBreakdownChart } from "@/components/Dashboard/StatusBreakdownChart"
import { TopPathsTable } from "@/components/Dashboard/TopPathsTable"
import useAuth from "@/hooks/useAuth"
import { OverviewService } from "@/services/overview"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: "Dashboard - DBAPI",
      },
    ],
  }),
})

function Dashboard() {
  const { user: currentUser } = useAuth()
  const [requestsDays, setRequestsDays] = useState(14)
  const [topPathsLimit, setTopPathsLimit] = useState(10)
  const [recentAccessLimit, setRecentAccessLimit] = useState(20)
  const [recentCommitsLimit, setRecentCommitsLimit] = useState(20)
  const [statusDays, setStatusDays] = useState(7)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const refreshInterval = autoRefresh ? 30_000 : false

  const statsQuery = useQuery({
    queryKey: ["overview", "stats"],
    queryFn: ({ signal }) => OverviewService.getStats({ signal }),
    staleTime: 60_000,
  })

  const requestsByDayQuery = useQuery({
    queryKey: ["overview", "requests-by-day", requestsDays],
    queryFn: ({ signal }) =>
      OverviewService.getRequestsByDay(requestsDays, { signal }),
  })

  const topPathsQuery = useQuery({
    queryKey: ["overview", "top-paths", requestsDays, topPathsLimit],
    queryFn: ({ signal }) =>
      OverviewService.getTopPaths(requestsDays, topPathsLimit, { signal }),
  })

  const statusBreakdownQuery = useQuery({
    queryKey: ["overview", "status-breakdown", statusDays],
    queryFn: ({ signal }) =>
      OverviewService.getStatusBreakdown(statusDays, { signal }),
  })

  const recentAccessQuery = useQuery({
    queryKey: ["overview", "recent-access", recentAccessLimit],
    queryFn: ({ signal }) =>
      OverviewService.getRecentAccess(recentAccessLimit, { signal }),
    refetchInterval: refreshInterval,
  })

  const recentCommitsQuery = useQuery({
    queryKey: ["overview", "recent-commits", recentCommitsLimit],
    queryFn: ({ signal }) =>
      OverviewService.getRecentCommits(recentCommitsLimit, { signal }),
    refetchInterval: refreshInterval,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Hi, {currentUser?.full_name || currentUser?.username}
        </p>
      </div>

      <ErrorBoundary section="Stats">
        <div className="space-y-2">
          {statsQuery.isError ? (
            <div className="text-sm text-destructive">
              Failed to load stats: {statsQuery.error.message}
            </div>
          ) : null}
          <StatsCards
            stats={statsQuery.data}
            isLoading={statsQuery.isLoading}
          />
        </div>
      </ErrorBoundary>

      <div className="grid gap-6 lg:grid-cols-2">
        <ErrorBoundary section="Requests by Day">
          {requestsByDayQuery.isError ? (
            <div className="text-sm text-destructive">
              Failed to load chart: {requestsByDayQuery.error.message}
            </div>
          ) : (
            <RequestsByDayChart
              isLoading={requestsByDayQuery.isLoading}
              requestsByDay={requestsByDayQuery.data?.data ?? []}
              requestsDays={requestsDays}
              onRequestsDaysChange={setRequestsDays}
            />
          )}
        </ErrorBoundary>

        <ErrorBoundary section="Status Breakdown">
          {statusBreakdownQuery.isError ? (
            <div className="text-sm text-destructive">
              Failed to load status breakdown:{" "}
              {statusBreakdownQuery.error.message}
            </div>
          ) : (
            <StatusBreakdownChart
              data={statusBreakdownQuery.data}
              isLoading={statusBreakdownQuery.isLoading}
              days={statusDays}
              onDaysChange={setStatusDays}
            />
          )}
        </ErrorBoundary>
      </div>

      <ErrorBoundary section="Top Paths">
        {topPathsQuery.isError ? (
          <div className="text-sm text-destructive">
            Failed to load top paths: {topPathsQuery.error.message}
          </div>
        ) : (
          <TopPathsTable
            rows={topPathsQuery.data?.data ?? []}
            isLoading={topPathsQuery.isLoading}
            limit={topPathsLimit}
            onLimitChange={setTopPathsLimit}
          />
        )}
      </ErrorBoundary>

      <div className="space-y-6">
        <ErrorBoundary section="Recent Commits">
          {recentCommitsQuery.isError ? (
            <div className="text-sm text-destructive">
              Failed to load recent commits: {recentCommitsQuery.error.message}
            </div>
          ) : (
            <RecentCommitsTable
              rows={recentCommitsQuery.data?.data ?? []}
              limit={recentCommitsLimit}
              onLimitChange={setRecentCommitsLimit}
            />
          )}
        </ErrorBoundary>

        <ErrorBoundary section="Recent Access">
          {recentAccessQuery.isError ? (
            <div className="text-sm text-destructive">
              Failed to load recent access: {recentAccessQuery.error.message}
            </div>
          ) : (
            <RecentAccessTable
              rows={recentAccessQuery.data?.data ?? []}
              limit={recentAccessLimit}
              onLimitChange={setRecentAccessLimit}
              autoRefresh={autoRefresh}
              onAutoRefreshChange={setAutoRefresh}
            />
          )}
        </ErrorBoundary>
      </div>
    </div>
  )
}
