import { Link as RouterLink, useRouterState } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"
import type { NavItem } from "./navItems"

interface MobileNavMenuProps {
  items: NavItem[]
  onLinkClick?: () => void
}

export function MobileNavMenu({ items, onLinkClick }: MobileNavMenuProps) {
  const router = useRouterState()
  const currentPath = router.location.pathname
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({})

  const toggleSubmenu = (title: string) => {
    setOpenSubmenus((prev) => ({ ...prev, [title]: !prev[title] }))
  }

  const linkClass = (path: string) =>
    cn(
      "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      currentPath === path
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    )

  return (
    <nav className="flex flex-col gap-1 px-2">
      {items.map((item) => {
        if (item.submenu?.length) {
          const isOpen = openSubmenus[item.title] ?? false
          const isActive = item.submenu.some((sub) => currentPath === sub.path)
          return (
            <div key={item.title}>
              <button
                type="button"
                onClick={() => toggleSubmenu(item.title)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="size-4" />
                {item.title}
                <ChevronRight
                  className={cn("ml-auto size-4 transition-transform", isOpen && "rotate-90")}
                />
              </button>
              {isOpen && (
                <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l pl-2">
                  {item.submenu.map((sub) => (
                    <RouterLink
                      key={sub.title}
                      to={sub.path}
                      onClick={onLinkClick}
                      className={linkClass(sub.path)}
                    >
                      {sub.title}
                    </RouterLink>
                  ))}
                </div>
              )}
            </div>
          )
        }
        return (
          <RouterLink
            key={item.title}
            to={item.path ?? "/"}
            onClick={onLinkClick}
            className={linkClass(item.path ?? "/")}
          >
            <item.icon className="size-4" />
            {item.title}
          </RouterLink>
        )
      })}
    </nav>
  )
}
