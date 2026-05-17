import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"

import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function ReportHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const { page = "1" } = await searchParams
  const pageNum = parseInt(page)
  const perPage = 20
  const skip = (pageNum - 1) * perPage

  const [files, total] = await Promise.all([
    prisma.generatedFile.findMany({
      where: { orgId: session.user.orgId },
      orderBy: { createdAt: "desc" },
      skip,
      take: perPage,
    }),
    prisma.generatedFile.count({ where: { orgId: session.user.orgId } }),
  ])
  // Fetch associated report titles separately
  const fileReportIds = files.filter(f => f.reportId).map(f => f.reportId!)
  const reportTitles = fileReportIds.length > 0
    ? Object.fromEntries(
        (await prisma.reportTemplate.findMany({
          where: { id: { in: fileReportIds } },
          select: { id: true, title: true },
        })).map(r => [r.id, r.title])
      )
    : {}

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Report History</h1>
        <p className="text-muted-foreground mt-1">
          Download or re-download previously generated reports.
        </p>
      </div>

      {files.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">📂</span>
            <h2 className="text-lg font-semibold">No generated files</h2>
            <p className="text-muted-foreground text-sm mt-1 max-w-md">
              Export a report to see it here.
            </p>
            <Link href="/reports">
              <Button className="mt-4">Go to Reports</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {files.map((file) => (
            <Card key={file.id}>
              <CardContent className="flex items-center gap-4 py-4">
                <span className="text-2xl">
                  {file.fileType === "pdf" ? "📕" : file.fileType === "csv" ? "📄" : "📊"}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm truncate">{file.fileName}</h3>
                    <p className="text-xs text-muted-foreground">
                      {reportTitles[file.reportId ?? ""] ?? "Unknown"} · {(file.fileSize / 1024).toFixed(1)} KB ·{" "}
                      {new Date(file.createdAt).toLocaleString()}
                    </p>
                </div>
                <div className="flex gap-2">
                  <a href={`/api/files/${file.id}/download`}>
                    <Button size="sm" variant="outline">Download</Button>
                  </a>
                  <a href={`/api/files/${file.id}/preview`}>
                    <Button size="sm" variant="ghost">Info</Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          {Array.from({ length: totalPages }).map((_, i) => (
            <Link
              key={i + 1}
              href={`/report-history?page=${i + 1}`}
              className={`px-3 py-1 rounded text-sm ${i + 1 === pageNum ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
            >
              {i + 1}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
