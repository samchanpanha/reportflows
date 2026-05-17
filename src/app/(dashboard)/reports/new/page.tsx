import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { ReportDesigner } from "@/components/report/report-designer"

export default async function NewReportPage() {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const queries = await prisma.query.findMany({
    where: { orgId: session.user.orgId },
    include: {
      dataSource: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  })

  if (queries.length === 0) {
    redirect("/queries?message=Create+a+query+first")
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Report</h1>
        <p className="text-muted-foreground mt-1">
          Design a report template with column configuration and export options
        </p>
      </div>
      <ReportDesigner queries={queries} />
    </div>
  )
}
