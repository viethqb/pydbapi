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
import { baseNavItems, securityNavItem } from "./navItems"
import { type Item, Main } from "./Main"
import { User } from "./User"

function toMainItem(
  item: (typeof baseNavItems)[number] | typeof securityNavItem,
): Item {
  return {
    icon: item.icon,
    title: item.title,
    path: item.path,
    submenu: item.submenu,
  }
}

export function AppSidebar() {
  const { user: currentUser } = useAuth()

  const items: Item[] = currentUser?.is_superuser
    ? [
        ...baseNavItems.map(toMainItem),
        toMainItem(securityNavItem),
        { icon: Users, title: "Admin", path: "/admin" },
      ]
    : baseNavItems.map(toMainItem)

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
