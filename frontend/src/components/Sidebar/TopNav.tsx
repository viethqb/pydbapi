import { Menu, Users } from "lucide-react"
import { Link as RouterLink, useRouterState } from "@tanstack/react-router"
import { useState } from "react"

import { SidebarAppearance } from "@/components/Common/Appearance"
import { Logo } from "@/components/Common/Logo"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import useAuth from "@/hooks/useAuth"
import { useIsMobile } from "@/hooks/useMobile"
import { baseNavItems, type NavItem } from "./navItems"
import { MobileNavMenu } from "./MobileNavMenu"
import { UserDropdownContent } from "./UserDropdownContent"

export function TopNav() {
  const { user: currentUser } = useAuth()
  const isMobile = useIsMobile()
  const router = useRouterState()
  const currentPath = router.location.pathname
  const [sheetOpen, setSheetOpen] = useState(false)

  const items: NavItem[] = currentUser?.is_superuser
    ? [
        ...baseNavItems,
        {
          icon: Users,
          title: "Admin",
          submenu: [
            { title: "Users", path: "/admin/users" },
            { title: "Roles", path: "/admin/roles" },
          ],
        },
      ]
    : baseNavItems

  const navLinkClass = (path: string) =>
    `px-3 py-2 text-sm font-medium rounded-md transition-colors hover:bg-accent hover:text-accent-foreground ${
      currentPath === path ? "bg-accent text-accent-foreground" : "text-muted-foreground"
    }`

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4">
      {/* Mobile: hamburger + logo + user */}
      {isMobile ? (
        <>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-1 md:hidden">
                <Menu className="size-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="flex h-full flex-col gap-2 py-4">
                <div className="px-4">
                  <Logo variant="responsive" />
                </div>
                <div className="flex-1 overflow-auto py-2">
                  <MobileNavMenu
                    items={items}
                    onLinkClick={() => setSheetOpen(false)}
                  />
                </div>
                <div className="border-t px-4 pt-4 space-y-2">
                  <RouterLink
                    to="/about"
                    onClick={() => setSheetOpen(false)}
                    className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    About
                  </RouterLink>
                  <SidebarAppearance />
                  <UserDropdownContent user={currentUser} inSheet />
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <RouterLink to="/" className="flex items-center flex-1">
            <Logo variant="responsive" />
          </RouterLink>
          <UserDropdownContent user={currentUser} />
        </>
      ) : (
        <>
          <RouterLink to="/" className="flex items-center shrink-0">
            <Logo variant="responsive" />
          </RouterLink>
          <nav className="flex flex-1 items-center gap-1">
            {items.map((item) => {
              if (item.submenu?.length) {
                const isActive = item.submenu.some((sub) => currentPath === sub.path)
                return (
                  <DropdownMenu key={item.title}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={navLinkClass(isActive ? currentPath : "")}
                      >
                        <item.icon className="mr-1.5 size-4" />
                        {item.title}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      {item.submenu.map((sub) => (
                        <DropdownMenuItem key={sub.title} asChild>
                          <RouterLink to={sub.path}>{sub.title}</RouterLink>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              }
              return (
                <Button
                  key={item.title}
                  variant="ghost"
                  size="sm"
                  asChild
                  className={navLinkClass(item.path ?? "")}
                >
                  <RouterLink to={item.path ?? "/"}>
                    <item.icon className="mr-1.5 size-4" />
                    {item.title}
                  </RouterLink>
                </Button>
              )
            })}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <RouterLink to="/about">About</RouterLink>
            </Button>
            <SidebarAppearance />
            <UserDropdownContent user={currentUser} />
          </div>
        </>
      )}
    </header>
  )
}

export default TopNav
