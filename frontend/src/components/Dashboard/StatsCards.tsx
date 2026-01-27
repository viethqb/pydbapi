import { Link } from "@tanstack/react-router"
import {
  Code2,
  Database,
  Layers,
  ShieldCheck,
  Users,
  Waypoints,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { OverviewStats } from "@/services/overview"

const statsItems = [
  {
    key: "datasources",
    label: "DataSources",
    to: "/connection",
    Icon: Database,
  },
  {
    key: "modules",
    label: "Modules",
    to: "/api-dev/modules",
    Icon: Layers,
  },
  {
    key: "groups",
    label: "Groups",
    to: "/system/groups",
    Icon: Users,
  },
  {
    key: "apis_total",
    label: "APIs (total)",
    to: "/api-dev/apis",
    Icon: Code2,
  },
  {
    key: "apis_published",
    label: "APIs (published)",
    to: "/api-repository",
    Icon: Waypoints,
  },
  {
    key: "clients",
    label: "Clients",
    to: "/system/clients",
    Icon: ShieldCheck,
  },
] as const

export function StatsCards(props: {
  stats?: OverviewStats
  isLoading?: boolean
}) {
  const { stats, isLoading } = props

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {statsItems.map(({ key, label, to, Icon }) => {
        return (
          <Link
            key={key}
            to={to}
            className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
          >
            <Card className="transition-colors hover:bg-muted/30">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading || !stats ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="text-2xl font-semibold tabular-nums">
                    {stats[key]}
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
