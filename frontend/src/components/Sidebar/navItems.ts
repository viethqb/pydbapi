import type { LucideIcon } from "lucide-react"
import {
  BookOpen,
  Code2,
  Database,
  FileSpreadsheet,
  LayoutDashboard,
  Settings,
  Shield,
} from "lucide-react"

export type SubMenuItem = {
  title: string
  path: string
}

export type NavItem = {
  icon: LucideIcon
  title: string
  path?: string
  submenu?: SubMenuItem[]
}

export const baseNavItems: NavItem[] = [
  { icon: LayoutDashboard, title: "Dashboard", path: "/" },
  { icon: Database, title: "Connection", path: "/connection" },
  {
    icon: Code2,
    title: "API Dev",
    submenu: [
      { title: "Modules", path: "/api-dev/modules" },
      { title: "APIs", path: "/api-dev/apis" },
      { title: "Macro definitions", path: "/api-dev/macro-defs" },
    ],
  },
  { icon: BookOpen, title: "API Repository", path: "/api-repository" },
  {
    icon: FileSpreadsheet,
    title: "Report Management",
    submenu: [
      { title: "Modules", path: "/report-management/modules" },
      { title: "Templates", path: "/report-management/templates" },
      { title: "Executions", path: "/report-management/executions" },
      { title: "API Info", path: "/report-management/info" },
    ],
  },
  {
    icon: Settings,
    title: "System",
    submenu: [
      { title: "Groups", path: "/system/groups" },
      { title: "Clients", path: "/system/clients" },
      { title: "Access logs", path: "/system/access-logs" },
    ],
  },
]

/** Security menu (Roles, etc.). Shown only for Admin (is_superuser). */
export const securityNavItem: NavItem = {
  icon: Shield,
  title: "Security",
  submenu: [{ title: "Roles", path: "/security/roles" }],
}
