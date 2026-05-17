import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default async function SchedulesPage() {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const schedules = await prisma.schedule.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { createdAt: "desc" },
  })
  const reportIds = schedules.filter(s => s.reportId).map(s => s.reportId!)
  const reportTitles = reportIds.length > 0
    ? Object.fromEntries(
        (await prisma.reportTemplate.findMany({
          where: { id: { in: reportIds } },
          select: { id: true, title: true },
        })).map(r => [r.id, r.title])
      )
    : {}

  const activeCount = schedules.filter((s) => s.enabled).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Schedules</h1>
          <p className="text-muted-foreground mt-1">
            Manage automated report generation schedules.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {activeCount} active / {schedules.length} total
          </span>
          <Link href="/schedules/new">
            <Button>+ New Schedule</Button>
          </Link>
        </div>
      </div>

      {schedules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">⏰</span>
            <h2 className="text-lg font-semibold">No schedules yet</h2>
            <p className="text-muted-foreground text-sm mt-1 max-w-md">
              Create schedules to automatically generate and send reports on a recurring basis.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium">Name</th>
                    <th className="text-left py-3 px-4 font-medium">Report</th>
                    <th className="text-left py-3 px-4 font-medium">Cron</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-left py-3 px-4 font-medium">Next Run</th>
                    <th className="text-left py-3 px-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-medium">
                        <Link href={`/schedules/${s.id}`} className="hover:underline">
                          {s.name}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {reportTitles[s.reportId ?? ""] ?? "—"}
                      </td>
                      <td className="py-3 px-4">
                        <code className="px-2 py-0.5 bg-muted rounded text-xs">
                          {s.cronExpr}
                        </code>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            s.enabled
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {s.enabled ? "Active" : "Paused"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs whitespace-nowrap">
                        {s.nextRunAt
                          ? new Date(s.nextRunAt).toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <form action={`/api/schedules/${s.id}/run`} method="POST">
                            <Button variant="outline" size="sm">Run Now</Button>
                          </form>
                          <form action={`/api/schedules/${s.id}/toggle`} method="POST">
                            <Button variant="ghost" size="sm">
                              {s.enabled ? "Pause" : "Enable"}
                            </Button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
