import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function NotificationsPage() {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const notifications = await prisma.notification.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  const unread = notifications.filter((n) => !n.read).length

  const typeStyle: Record<string, { icon: string; badge: string }> = {
    INFO: { icon: "ℹ️", badge: "bg-blue-100 text-blue-700" },
    WARNING: { icon: "⚠️", badge: "bg-yellow-100 text-yellow-700" },
    ERROR: { icon: "❌", badge: "bg-red-100 text-red-700" },
    SUCCESS: { icon: "✅", badge: "bg-emerald-100 text-emerald-700" },
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground mt-1">
            Stay updated on system events and alerts.
          </p>
        </div>
        {unread > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium">
            {unread} unread
          </span>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">🔔</span>
            <h2 className="text-lg font-semibold">No notifications</h2>
            <p className="text-muted-foreground text-sm mt-1 max-w-md">
              You&apos;re all caught up! Notifications will appear here when important events happen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const style = typeStyle[n.type] || typeStyle.INFO
            return (
              <Card
                key={n.id}
                className={`transition-colors ${
                  !n.read ? "border-l-4 border-l-blue-500" : "opacity-75"
                }`}
              >
                <CardContent className="flex items-start gap-3 py-4">
                  <span className="text-xl mt-0.5">{style.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-sm">{n.title}</h3>
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-medium ${style.badge}`}
                      >
                        {n.type}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
