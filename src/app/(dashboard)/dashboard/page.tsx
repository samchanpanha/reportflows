import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

async function getStats(orgId: string) {
  const [
    dataSourceCount,
    reportCount,
    schedulesCount,
    recentLogs,
  ] = await Promise.all([
    prisma.dataSource.count({ where: { orgId } }),
    prisma.reportTemplate.count({ where: { orgId } }),
    prisma.schedule.count({ where: { orgId } }),
    prisma.auditLog.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        action: true,
        entityType: true,
        createdAt: true,
      },
    }),
  ])
  return { dataSourceCount, reportCount, schedulesCount, recentLogs }
}

export default async function DashboardPage() {
  const session = await auth()
  const orgId = session?.user?.orgId
  if (!orgId) return <p>Unauthorized</p>

  const stats = await getStats(orgId)

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Data Sources</CardTitle>
            🗄️
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.dataSourceCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Reports</CardTitle>
            📋
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.reportCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Schedules</CardTitle>
            ⏰
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.schedulesCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentLogs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No recent activity.</p>
          ) : (
            <ul className="space-y-2">
              {stats.recentLogs.map((log, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">?</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{log.action}</span>
                  <span className="text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
