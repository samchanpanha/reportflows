import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function ReportsPage() {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const reports = await prisma.reportTemplate.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { updatedAt: "desc" },
  })

  // Fetch associated query data separately
  const reportIds = reports.filter(r => r.queryId).map(r => r.id!)
  const queriesForReports = reportIds.length > 0
    ? await prisma.query.findMany({ where: { id: { in: reportIds } }, select: { id: true, name: true } })
    : []
  const queryMap = Object.fromEntries(queriesForReports.map(q => [q.id, q.name]))

  const formatBadge: Record<string, string> = {
    PDF: "bg-red-100 text-red-700",
    EXCEL: "bg-green-100 text-green-700",
    CSV: "bg-blue-100 text-blue-700",
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground mt-1">
            View and manage your report templates.
          </p>
        </div>
        <Link href="/reports/new">
          <Button>+ New Report</Button>
        </Link>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">📋</span>
            <h2 className="text-lg font-semibold">No reports yet</h2>
            <p className="text-muted-foreground text-sm mt-1 max-w-md">
              Create report templates to generate PDF, Excel, or CSV reports from your queries.
            </p>
            <Link href="/reports/new" className="mt-4">
              <Button>Create your first report</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reports.map((r) => (
            <Link key={r.id} href={`/reports/${r.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{r.title}</CardTitle>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${
                        formatBadge[r.format] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {r.format}
                    </span>
                  </div>
                  {r.description && (
                    <p className="text-sm text-muted-foreground mt-1">{r.description}</p>
                  )}
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                  {r.queryId && (
                    <p>Query: <span className="font-medium text-foreground">{queryMap[r.queryId] ?? "Unknown"}</span></p>
                  )}
                  <p>Updated: <span className="font-medium text-foreground">{new Date(r.updatedAt).toLocaleDateString()}</span></p>
                  {r.lastRunAt && (
                    <p>Last run: <span className="font-medium text-foreground">{new Date(r.lastRunAt).toLocaleDateString()}</span></p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
