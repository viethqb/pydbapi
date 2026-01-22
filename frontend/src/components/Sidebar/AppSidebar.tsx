import {
  BookOpen,
  Code2,
  Database,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react"
import { Link as RouterLink } from "@tanstack/react-router"

import { SidebarAppearance } from "@/components/Common/Appearance"
import { Logo } from "@/components/Common/Logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { type Item, Main } from "./Main"
import { User } from "./User"

const baseItems: Item[] = [
  { icon: LayoutDashboard, title: "Dashboard", path: "/" },
  { icon: Database, title: "Connection", path: "/connection" },
  {
    icon: Code2,
    title: "API Dev",
    submenu: [
      { title: "Modules", path: "/api-dev/modules" },
      { title: "APIs", path: "/api-dev/apis" },
    ],
  },
  { icon: BookOpen, title: "API Repository", path: "/api-repository" },
  {
    icon: Settings,
    title: "System",
    submenu: [
      { title: "Groups", path: "/system/groups" },
      { title: "Clients", path: "/system/clients" },
      { title: "Firewall", path: "/system/firewall" },
      { title: "Alarm", path: "/system/alarm" },
    ],
  },
]

export function AppSidebar() {
  const { user: currentUser } = useAuth()

  const items = currentUser?.is_superuser
    ? [...baseItems, { icon: Users, title: "Admin", path: "/admin" }]
    : baseItems

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-6 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
        <Logo variant="responsive" />
      </SidebarHeader>
      <SidebarContent>
        <Main items={items} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="About">
              <RouterLink to="/about">
                <span>About</span>
              </RouterLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarAppearance />
        <User user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
