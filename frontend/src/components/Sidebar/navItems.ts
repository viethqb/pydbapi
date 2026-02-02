import {
  BookOpen,
  Code2,
  Database,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

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
    icon: Settings,
    title: "System",
    submenu: [
      { title: "Groups", path: "/system/groups" },
      { title: "Clients", path: "/system/clients" },
    ],
  },
]
