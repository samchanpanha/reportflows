import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") || "csv"

  try {
    const session = await auth()
    if (!session?.user?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const action = request.nextUrl.searchParams.get("action") || undefined
    const entityType = request.nextUrl.searchParams.get("entityType") || undefined
    const daysBack = parseInt(request.nextUrl.searchParams.get("days") || "30", 10)
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)

    const where: Record<string, any> = {
      orgId: session.user.orgId,
      createdAt: { gte: since },
    }
    if (action) where.action = action
    if (entityType) where.entityType = entityType

    const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 5000 })

    const cols = ["Action", "Entity Type", "Entity ID", "Details", "IP Address", "Timestamp", "User ID"]
    const rows = logs.map((l) => [
      l.action,
      l.entityType,
      l.entityId || "",
      JSON.stringify(l.details ?? {}),
      l.ipAddress || "",
      l.createdAt.toISOString(),
      l.userId || "",
    ])

    const csvRows = [cols, ...rows].map((r: string[]) => r.map(csvEscape).join(",")).join("\r\n")
    const bom = "\uFEFF"
    const buffer = Buffer.from(bom + csvRows, "utf-8")
    const fileName = `audit_logs_${new Date().toISOString().slice(0, 10)}_${Date.now()}.csv`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error("Audit export error:", error)
    return NextResponse.json({ error: "Failed to export audit log" }, { status: 500 })
  }
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}
