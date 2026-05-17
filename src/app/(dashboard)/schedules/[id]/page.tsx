import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScheduleForm } from "@/components/schedule/schedule-form"
import { getAllScheduleLogs } from "@/app/actions/schedules"

export default async function EditSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const { id } = await params
  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: { executions: { orderBy: { createdAt: "desc" }, take: 10 } },
  })

  if (!schedule || schedule.orgId !== session.user.orgId) notFound()

  const reports = await prisma.reportTemplate.findMany({
    where: { orgId: session.user.orgId },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  })

  const logs = await getAllScheduleLogs(id)

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/schedules">
          <Button variant="ghost" size="sm">← Back</Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">{schedule.name}</h1>
          <p className="text-muted-foreground mt-1">
            Edit schedule configuration and view execution history.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Schedule Details</CardTitle>
          <CardDescription>Update cron expression, recipients, and report attachment.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScheduleForm
            orgId={session.user.orgId}
            initialData={{
              id: schedule.id,
              name: schedule.name,
              cronExpr: schedule.cronExpr,
              reportId: schedule.reportId ?? undefined,
              recipients: schedule.recipients,
              retryCount: schedule.retryCount,
              enabled: schedule.enabled,
            }}
            reports={reports}
          />
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Execution History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2 px-4 font-medium">Status</th>
                    <th className="text-left py-2 px-4 font-medium">Trigger</th>
                    <th className="text-left py-2 px-4 font-medium">Duration</th>
                    <th className="text-left py-2 px-4 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b">
                      <td className="py-2 px-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          log.status === "SUCCESS" ? "bg-green-100 text-green-700" :
                          log.status === "FAILED" ? "bg-red-100 text-red-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>{log.status}</span>
                      </td>
                      <td className="py-2 px-4 text-muted-foreground text-xs">{log.trigger}</td>
                      <td className="py-2 px-4 text-muted-foreground text-xs">{log.duration ? `${log.duration}ms` : "—"}</td>
                      <td className="py-2 px-4 text-muted-foreground text-xs whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
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
