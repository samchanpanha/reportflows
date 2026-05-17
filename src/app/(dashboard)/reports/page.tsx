import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function ReportsPage() {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const reports = await prisma.reportTemplate.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { updatedAt: "desc" },
  })

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
        <span className="text-sm text-muted-foreground">
          {reports.length} report{reports.length !== 1 && "s"}
        </span>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">📋</span>
            <h2 className="text-lg font-semibold">No reports yet</h2>
            <p className="text-muted-foreground text-sm mt-1 max-w-md">
              Create report templates to generate PDF, Excel, or CSV reports from your queries.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reports.map((r) => (
            <Card key={r.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium">{r.title}</CardTitle>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      formatBadge[r.format] || "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {r.format}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>{r.description || "No description"}</p>
                <div className="flex justify-between text-xs pt-2 border-t">
                  <span>
                    Last run:{" "}
                    {r.lastRunAt
                      ? new Date(r.lastRunAt).toLocaleDateString()
                      : "Never"}
                  </span>
                  <span>
                    Updated {new Date(r.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
