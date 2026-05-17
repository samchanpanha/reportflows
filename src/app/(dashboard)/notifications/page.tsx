import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { NotificationsClient } from "./client"

export default async function NotificationsPage() {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const [notifications, channels] = await Promise.all([
    prisma.notification.findMany({ where: { orgId: session.user.orgId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.notificationChannel.findMany({ where: { orgId: session.user.orgId }, orderBy: { createdAt: "desc" } }),
  ])

  const unread = notifications.filter((n) => !n.read).length

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground mt-1">Configure delivery channels and view system alerts.</p>
        </div>
        {unread > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium">
            {unread} unread
          </span>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Delivery Channels</h2>
        <NotificationsClient channels={channels.map((c) => ({ ...c, config: c.config as Record<string, any> }))} />
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Recent Alerts</h2>
        {notifications.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-12">No notifications yet.</div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={"rounded-lg border p-4 " + (n.read ? "bg-card opacity-75" : "bg-blue-50/50 border-blue-200")}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">🔔</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-sm">{n.title}</h3>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                    </div>
                    <p className="text-sm text-muted-foreground">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-2">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
