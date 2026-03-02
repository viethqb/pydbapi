import { Link as RouterLink } from "@tanstack/react-router"
import { ChevronsUpDown, LogOut, Settings } from "lucide-react"

import type { UserPublic } from "@/client"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import useAuth from "@/hooks/useAuth"
import { getInitials } from "@/utils"

function UserInfo({
  fullName,
  username,
}: {
  fullName?: string
  username?: string
}) {
  return (
    <div className="flex items-center gap-2.5 w-full min-w-0">
      <Avatar className="size-8">
        <AvatarFallback className="bg-zinc-600 text-white">
          {getInitials(fullName || username || "User")}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col items-start min-w-0">
        <p className="text-sm font-medium truncate w-full">{fullName || username}</p>
        {fullName && (
          <p className="text-xs text-muted-foreground truncate w-full">{username}</p>
        )}
      </div>
    </div>
  )
}

export function UserDropdownContent({
  user,
  inSheet,
}: {
  user: UserPublic | null
  inSheet?: boolean
}) {
  const { logout } = useAuth()

  if (!user) return null

  const trigger = inSheet ? (
    <Button
      variant="ghost"
      className="w-full justify-start gap-2 h-auto py-2"
      data-testid="user-menu"
    >
      <UserInfo fullName={user?.full_name} username={user?.username} />
      <ChevronsUpDown className="ml-auto size-4 text-muted-foreground shrink-0" />
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="sm"
      className="gap-2 min-w-0"
      data-testid="user-menu"
    >
      <UserInfo fullName={user?.full_name} username={user?.username} />
      <ChevronsUpDown className="size-4 text-muted-foreground shrink-0" />
    </Button>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-56 rounded-lg"
        side={inSheet ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <UserInfo fullName={user?.full_name} username={user?.username} />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <RouterLink to="/settings">
          <DropdownMenuItem>
            <Settings />
            User Settings
          </DropdownMenuItem>
        </RouterLink>
        <DropdownMenuItem onClick={() => logout()}>
          <LogOut />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
