"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { redirect } from "next/navigation"
import { z } from "zod"
import type { Prisma } from "@prisma/client"

const createReportSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  queryId: z.string().uuid().optional(),
  format: z.enum(["PDF", "EXCEL", "CSV"]).default("EXCEL"),
  columnsConfig: z.record(z.string(), z.any()).optional(),
})

const updateReportSchema = createReportSchema.extend({
  id: z.string().uuid(),
})

export async function createReport(formData: unknown) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const validated = createReportSchema.parse(formData)

    // Verify query ownership if provided
    if (validated.queryId) {
      const query = await prisma.query.findUnique({
        where: { id: validated.queryId },
      })

      if (!query || query.orgId !== session.user.orgId) {
        return { success: false, error: "Query not found" }
      }
    }

const report = await prisma.reportTemplate.create({
       data: {
         orgId: session.user.orgId,
         title: validated.title,
         description: validated.description,
         queryId: validated.queryId,
         format: validated.format,
         columnsConfig: validated.columnsConfig as Prisma.InputJsonValue | undefined,
       },
     })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "REPORT_CREATED",
      entityType: "report",
      entityId: report.id,
      details: { title: validated.title },
    })

    return { success: true, id: report.id }
  } catch (error) {
    console.error("Create report error:", error)
    const message = error instanceof z.ZodError 
      ? error.issues[0]?.message
      : "Failed to create report"
    return { success: false, error: message }
  }
}

export async function updateReport(formData: unknown) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const validated = updateReportSchema.parse(formData)

    // Check ownership
    const existing = await prisma.reportTemplate.findUnique({
      where: { id: validated.id },
    })

    if (!existing || existing.orgId !== session.user.orgId) {
      return { success: false, error: "Report not found" }
    }

    // Verify query ownership if provided
    if (validated.queryId) {
      const query = await prisma.query.findUnique({
        where: { id: validated.queryId },
      })

      if (!query || query.orgId !== session.user.orgId) {
        return { success: false, error: "Query not found" }
      }
    }

const updated = await prisma.reportTemplate.update({
       where: { id: validated.id },
       data: {
         title: validated.title,
         description: validated.description,
         queryId: validated.queryId,
         format: validated.format,
         columnsConfig: validated.columnsConfig as Prisma.InputJsonValue | undefined,
       },
     })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "REPORT_UPDATED",
      entityType: "report",
      entityId: validated.id,
      details: { title: validated.title },
    })

    return { success: true, id: updated.id }
  } catch (error) {
    console.error("Update report error:", error)
    const message = error instanceof z.ZodError 
      ? error.issues[0]?.message
      : "Failed to update report"
    return { success: false, error: message }
  }
}

export async function deleteReport(id: string) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const report = await prisma.reportTemplate.findUnique({
      where: { id },
    })

    if (!report || report.orgId !== session.user.orgId) {
      return { success: false, error: "Report not found" }
    }

    await prisma.reportTemplate.delete({ where: { id } })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "REPORT_DELETED",
      entityType: "report",
      entityId: id,
      details: { title: report.title },
    })

    return { success: true }
  } catch (error) {
    console.error("Delete report error:", error)
    return { success: false, error: "Failed to delete report" }
  }
}

export async function exportReport(id: string, format?: "PDF" | "EXCEL" | "CSV") {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const report = await prisma.reportTemplate.findUnique({
      where: { id },
    })

    if (!report || report.orgId !== session.user.orgId) {
      return { success: false, error: "Report not found" }
    }

    const exportFormat = format || (report.format as "PDF" | "EXCEL" | "CSV") || "EXCEL"

    // TODO: Implement actual export
    // 1. If queryId exists, execute query to get columns and rows
    // 2. Apply columnsConfig (ordering, visibility, formatting)
    // 3. Generate PDF/Excel/CSV buffer
    // 4. Store in GeneratedFile with expiration
    // 5. Return download link

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "REPORT_EXPORTED",
      entityType: "report",
      entityId: id,
      details: { format: exportFormat },
    })

    return { 
      success: true, 
      message: "Export not yet implemented",
      downloadUrl: "/api/reports/placeholder",
    }
  } catch (error) {
    console.error("Export report error:", error)
    return { success: false, error: "Failed to export report" }
  }
}
