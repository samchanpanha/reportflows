"use client"

import { signOut, useSession } from "next-auth/react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Menu } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

import { hasPermission } from "@/lib/permissions"

const defaultNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: "📊", showTo: "ALL" },
  { href: "/data-sources", label: "Data Sources", icon: "🗄️", showTo: "ALL" },
  { href: "/queries", label: "Queries", icon: "💬", showTo: "ALL" },
  { href: "/reports", label: "Reports", icon: "📋", showTo: "ALL" },
  { href: "/notifications", label: "Notifications", icon: "🔔", showTo: "ALL" },
  { href: "/schedules", label: "Schedules", icon: "⏰", showTo: "ALL" },
  { href: "/audit-logs", label: "Audit Logs", icon: "📝", showTo: "ALL" },
  { href: "/users", label: "Users", icon: "👥", showTo: "canManageUsers" },
  { href: "/superadmin", label: "Super Admin", icon: "👑", showTo: "canManageSystem" },
  { href: "/settings", label: "Settings", icon: "⚙️", showTo: "ALL" },
]

interface SidebarProps {
  session: Awaited<ReturnType<typeof useSession>>["data"]
  pathname: string
  navItems: Array<{ href: string; label: string; icon: string }>
}

function Sidebar({ session, pathname, navItems }: SidebarProps) {
  return (
    <div className="flex flex-col h-full bg-muted/40 border-r">
      <div className="p-4 font-bold text-xl">ReportFlow</div>
      <nav className="flex-1 px-2 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent",
              pathname.startsWith(item.href) && "bg-accent font-semibold"
            )}
          >
            <span>{item.icon}</span> {item.label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t flex items-center gap-2">
        <Avatar>
          <AvatarImage src={session?.user?.image || ""} />
          <AvatarFallback>
            {session?.user?.name?.charAt(0) || "U"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{session?.user?.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {session?.user?.email}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => signOut()}>
          🚪
        </Button>
      </div>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session } = useSession()
  const pathname = usePathname()

  const userRole = session?.user?.role || "VIEWER"

  const navItems = defaultNavItems.filter((item) => {
    if (item.showTo === "ALL") return true
    if (item.showTo === "canManageUsers") return hasPermission(userRole, "canManageUsers")
    if (item.showTo === "canManageSystem") return hasPermission(userRole, "canManageSystem")
    return false
  })

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 flex-shrink-0">
        <Sidebar session={session} pathname={pathname} navItems={navItems} />
      </aside>

      {/* Mobile sidebar */}
      <div className="lg:hidden">
        <Sheet>
          {/* @ts-expect-error Type error due to Radix UI typing in React 19 */}
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="absolute top-4 left-4 z-40">
              <Menu />
            </Button>
          </SheetTrigger>
<SheetContent side="left" className="p-0 w-64">
             <Sidebar session={session} pathname={pathname} navItems={navItems} />
           </SheetContent>
        </Sheet>
      </div>

      <main className="flex-1 overflow-auto p-6 animate-fade-to-black">{children}</main>
    </div>
  )
}
