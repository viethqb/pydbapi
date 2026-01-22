import { Link as RouterLink, useRouterState } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useEffect, useState } from "react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"

export type SubMenuItem = {
  title: string
  path: string
}

export type Item = {
  icon: LucideIcon
  title: string
  path?: string
  submenu?: SubMenuItem[]
}

interface MainProps {
  items: Item[]
}

export function Main({ items }: MainProps) {
  const { isMobile, setOpenMobile } = useSidebar()
  const router = useRouterState()
  const currentPath = router.location.pathname
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({})

  // Auto-open submenu if current path matches any submenu item
  useEffect(() => {
    items.forEach((item) => {
      if (item.submenu) {
        const isOnSubmenuPage = item.submenu.some(
          (sub) => currentPath === sub.path,
        )
        if (isOnSubmenuPage) {
          setOpenSubmenus((prev) => ({
            ...prev,
            [item.title]: true,
          }))
        }
      }
    })
  }, [currentPath, items])

  const handleMenuClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  const toggleSubmenu = (title: string) => {
    setOpenSubmenus((prev) => ({
      ...prev,
      [title]: !prev[title],
    }))
  }

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const hasSubmenu = item.submenu && item.submenu.length > 0
            const isSubmenuOpen = openSubmenus[item.title] ?? false
            const isActive =
              item.path
                ? currentPath === item.path
                : hasSubmenu
                  ? item.submenu?.some((sub) => currentPath === sub.path) ?? false
                  : false

            if (hasSubmenu) {
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={isActive}
                    onClick={() => toggleSubmenu(item.title)}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                    <ChevronRight
                      className={`ml-auto transition-transform ${
                        isSubmenuOpen ? "rotate-90" : ""
                      }`}
                    />
                  </SidebarMenuButton>
                  {isSubmenuOpen && (
                    <SidebarMenuSub>
                      {item.submenu?.map((subItem) => {
                        const isSubActive = currentPath === subItem.path
                        return (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton
                              isActive={isSubActive}
                              asChild
                            >
                              <RouterLink
                                to={subItem.path}
                                onClick={handleMenuClick}
                              >
                                <span>{subItem.title}</span>
                              </RouterLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              )
            }

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={isActive}
                  asChild
                >
                  <RouterLink to={item.path!} onClick={handleMenuClick}>
                    <item.icon />
                    <span>{item.title}</span>
                  </RouterLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
