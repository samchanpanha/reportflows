import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { ReportDesigner } from "@/components/report/report-designer"
import type { Prisma } from "@prisma/client"

export default async function EditReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const { id } = await params
  const report = await prisma.reportTemplate.findUnique({
    where: { id },
  })

  if (!report || report.orgId !== session.user.orgId) {
    redirect("/reports")
  }

  const queries = await prisma.query.findMany({
    where: { orgId: session.user.orgId },
    include: {
      dataSource: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  })

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Edit Report</h1>
        <p className="text-muted-foreground mt-1">
          Update report: {report.title}
        </p>
      </div>
      <ReportDesigner
        queries={queries}
        initialData={{
          id: report.id,
          title: report.title,
          description: report.description || undefined,
          queryId: report.queryId || undefined,
          format: report.format,
          columnsConfig: report.columnsConfig as Prisma.JsonObject | undefined,
        }}
        onSuccess={() => redirect("/reports")}
      />
    </div>
  )
}
