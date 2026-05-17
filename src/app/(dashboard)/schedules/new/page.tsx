import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScheduleForm } from "@/components/schedule/schedule-form"

export default async function NewSchedulePage() {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const reports = await prisma.reportTemplate.findMany({
    where: { orgId: session.user.orgId },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  })

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link href="/schedules">
          <Button variant="ghost" size="sm">← Back</Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">New Schedule</h1>
          <p className="text-muted-foreground mt-1">
            Define a cron schedule for automated report generation.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Schedule Configuration</CardTitle>
          <CardDescription>When and what to run.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScheduleForm orgId={session.user.orgId} reports={reports} />
        </CardContent>
      </Card>
    </div>
  )
}
