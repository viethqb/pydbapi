import { Link as RouterLink } from "@tanstack/react-router"
import { Users } from "lucide-react"

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
import { usePermissions } from "@/hooks/usePermissions"
import { baseNavItems, securityNavItem } from "./navItems"
import { type Item, Main } from "./Main"
import { User } from "./User"

function toMainItem(
  item: (typeof baseNavItems)[number] | typeof securityNavItem,
  filterSubmenu?: (sub: { title: string; path: string }) => boolean,
): Item {
  const submenu =
    item.submenu && filterSubmenu
      ? item.submenu.filter(filterSubmenu)
      : item.submenu
  return {
    icon: item.icon,
    title: item.title,
    path: item.path,
    submenu: submenu?.length ? submenu : undefined,
  }
}

export function AppSidebar() {
  const { user: currentUser } = useAuth()
  const { hasPermission } = usePermissions()

  const items: Item[] = (() => {
    const canAccessLogs = hasPermission("access_log", "read")
    const filter = (item: (typeof baseNavItems)[number] | typeof securityNavItem) =>
      toMainItem(item, (sub) => {
        if (sub.path === "/system/access-logs") return canAccessLogs
        return true
      })
    const base = baseNavItems.map(filter)
    if (currentUser?.is_superuser) {
      return [
        ...base,
        toMainItem(securityNavItem),
        { icon: Users, title: "Admin", path: "/admin" },
      ]
    }
    return base
  })()

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
