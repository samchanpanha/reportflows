import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { NextRequest, NextResponse } from "next/server"
import { generateExcelBuffer, generatePDFBuffer, generateCSVBuffer } from "@/lib/report-generators"
import type { Prisma } from "@prisma/client"

async function fetchOrGenerateRows(queryId: string, orgId: string): Promise<{ columns: { key: string; label: string }[]; rows: Prisma.JsonObject[] }> {
  const query = await prisma.query.findUnique({ where: { id: queryId } })
  if (!query || query.orgId !== orgId) {
    return { columns: [], rows: [] }
  }
  // Executing real SQL requires a DB connection pool per datasource, which is out of scope here.
  // Return placeholder data and warn callers.
  console.warn(`[EXPORT] Query ${queryId} would execute SQL: ${query.sqlText.slice(0, 120)}...`)
  const placeholderRows: Prisma.JsonObject[] = Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    name: `Sample Row ${i + 1}`,
    value: Math.round(Math.random() * 10000) / 100,
    date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
    status: i % 3 === 0 ? "Active" : i % 3 === 1 ? "Pending" : "Inactive",
  }))
  const columns = [
    { key: "id", label: "ID", format: "number" as const },
    { key: "name", label: "Name", format: "text" as const },
    { key: "value", label: "Value", format: "currency" as const },
    { key: "date", label: "Date", format: "date" as const },
    { key: "status", label: "Status", format: "text" as const },
  ]
  return { columns, rows: placeholderRows }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const exportFormat = (request.nextUrl.searchParams.get("format") || "EXCEL") as "PDF" | "EXCEL" | "CSV"

    const report = await prisma.reportTemplate.findUnique({
      where: { id },
    })

    if (!report || report.orgId !== session.user.orgId) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    // Build columns config from report config or fallback to query columns
    let columnsConfig: Array<{ key: string; label?: string; visible?: boolean; format?: string; order?: number }>
    if (report.columnsConfig && typeof report.columnsConfig === "object") {
      columnsConfig = Object.entries(report.columnsConfig as Record<string, unknown>).map(([key, cfg]: [string, unknown]) => {
        const cfgObj = cfg as Record<string, unknown> | null
        return {
          key,
          label: typeof cfgObj?.label === "string" ? cfgObj.label : key,
          visible: cfgObj?.visible !== false,
          format: typeof cfgObj?.format === "string" ? cfgObj.format : "text",
          order: typeof cfgObj?.order === "number" ? cfgObj.order : 0,
        }
      })
    } else if (report.queryId) {
      columnsConfig = []
    } else {
      return NextResponse.json({ error: "No query linked and no column config available" }, { status: 400 })
    }

    // Fetch/generate row data
    let resultData: { columns: { key: string; label: string }[]; rows: Prisma.JsonObject[] }
    if (report.queryId) {
      resultData = await fetchOrGenerateRows(report.queryId, session.user.orgId)
    } else {
      resultData = { columns: [], rows: [] }
    }
    const columns = resultData.columns
    const rows = resultData.rows

    // Merge query columns with columnsConfig
    const columnDefs = columns
      .filter(c => columnsConfig.find(cc => cc.key === c.key && cc.visible !== false))
      .map(c => {
        const cfg = columnsConfig.find(cc => cc.key === c.key)
        return {
          key: c.key,
          label: cfg?.label || c.label,
          visible: cfg?.visible ?? true,
          order: cfg?.order ?? 0,
          format: (cfg?.format || "text") as "text" | "number" | "date" | "currency",
        }
      })
      .sort((a, b) => a.order - b.order)

// Add any columns in config not in query result
     for (const cfg of columnsConfig) {
       if (cfg.visible && !columns.find(c => c.key === cfg.key)) {
         const format = cfg.format === "text" || cfg.format === "number" || cfg.format === "date" || cfg.format === "currency" 
           ? cfg.format 
           : "text"
         columnDefs.push({ key: cfg.key, label: cfg.label || cfg.key, visible: true, order: cfg.order ?? 99, format })
       }
     }

    const design = {
      title: report.title,
      description: report.description ?? undefined,
      columns: columnDefs,
    }

    let buffer: Buffer
    let fileName: string
    let contentType: string

    const safeName = report.title.replace(/[^a-zA-Z0-9_-]/g, "_")
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    fileName = `${safeName}_${timestamp}`

    switch (exportFormat) {
      case "PDF":
        buffer = await generatePDFBuffer(design, rows)
        fileName += ".pdf"
        contentType = "application/pdf"
        break
      case "CSV":
        buffer = await generateCSVBuffer(design, rows)
        fileName += ".csv"
        contentType = "text/csv; charset=utf-8"
        break
      case "EXCEL":
      default:
        buffer = await generateExcelBuffer(design, rows)
        fileName += ".xlsx"
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        break
    }

    // Persist record
    await prisma.generatedFile.create({
      data: {
        orgId: session.user.orgId,
        reportId: report.id,
        fileName,
        fileSize: buffer.length,
        filePath: `/generated/${fileName}`,
        fileType: exportFormat === "PDF" ? "pdf" : exportFormat === "CSV" ? "csv" : "xlsx",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
      },
    })

    await prisma.reportTemplate.update({
      where: { id },
      data: { lastRunAt: new Date() },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "REPORT_EXPORTED",
      entityType: "report",
      entityId: id,
      details: { format: exportFormat, fileName, fileSize: buffer.length },
    })

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error("Export error:", error)
    const msg = error instanceof Error ? error.message : "Failed to export report"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
