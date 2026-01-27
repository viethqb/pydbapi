import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { DashboardCharts } from "@/components/Dashboard/DashboardCharts"
import { RecentAccessTable } from "@/components/Dashboard/RecentAccessTable"
import { RecentCommitsTable } from "@/components/Dashboard/RecentCommitsTable"
import { StatsCards } from "@/components/Dashboard/StatsCards"
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

  const statsQuery = useQuery({
    queryKey: ["overview", "stats"],
    queryFn: OverviewService.getStats,
  })

  const requestsByDayQuery = useQuery({
    queryKey: ["overview", "requests-by-day", requestsDays],
    queryFn: () => OverviewService.getRequestsByDay(requestsDays),
  })

  const topPathsQuery = useQuery({
    queryKey: ["overview", "top-paths", 7, topPathsLimit],
    queryFn: () => OverviewService.getTopPaths(7, topPathsLimit),
  })

  const recentAccessQuery = useQuery({
    queryKey: ["overview", "recent-access", recentAccessLimit],
    queryFn: () => OverviewService.getRecentAccess(recentAccessLimit),
  })

  const recentCommitsQuery = useQuery({
    queryKey: ["overview", "recent-commits", 20],
    queryFn: () => OverviewService.getRecentCommits(20),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Hi, {currentUser?.full_name || currentUser?.email}
        </p>
      </div>

      <div className="space-y-2">
        {statsQuery.isError ? (
          <div className="text-sm text-destructive">
            Failed to load stats: {statsQuery.error.message}
          </div>
        ) : null}
        <StatsCards stats={statsQuery.data} isLoading={statsQuery.isLoading} />
      </div>

      <div className="space-y-2">
        {requestsByDayQuery.isError ? (
          <div className="text-sm text-destructive">
            Failed to load charts: {requestsByDayQuery.error.message}
          </div>
        ) : null}
        <DashboardCharts
          isLoading={requestsByDayQuery.isLoading || topPathsQuery.isLoading}
          requestsByDay={requestsByDayQuery.data?.data ?? []}
          topPaths={topPathsQuery.data?.data ?? []}
          requestsDays={requestsDays}
          onRequestsDaysChange={setRequestsDays}
          topPathsLimit={topPathsLimit}
          onTopPathsLimitChange={setTopPathsLimit}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {recentAccessQuery.isError ? (
          <div className="text-sm text-destructive">
            Failed to load recent access: {recentAccessQuery.error.message}
          </div>
        ) : (
          <RecentAccessTable
            rows={recentAccessQuery.data?.data ?? []}
            limit={recentAccessLimit}
            onLimitChange={setRecentAccessLimit}
          />
        )}

        {recentCommitsQuery.isError ? (
          <div className="text-sm text-destructive">
            Failed to load recent commits: {recentCommitsQuery.error.message}
          </div>
        ) : (
          <RecentCommitsTable rows={recentCommitsQuery.data?.data ?? []} />
        )}
      </div>
    </div>
  )
}
