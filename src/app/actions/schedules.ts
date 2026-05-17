"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { redirect } from "next/navigation"
import { z } from "zod"
import { computeNextRunAt } from "@/lib/cron-utils"

const scheduleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  reportId: z.string().uuid().optional(),
  cronExpr: z.string().regex(/^(\*|[0-9\-\/\*\,\?]+)\s+(\*|[0-9\-\/\*\,\?]+)\s+(\*|[0-9\-\/\*\,\?]+)\s+(\*|[0-9\-\/\*\,\?]+)\s+(\*|[0-9\-\/\*\,\?]+)$/, "Invalid cron expression"),
  channelId: z.string().uuid().optional(),
  recipients: z.array(z.string()).default([]),
  retryCount: z.number().min(0).max(10).default(3),
})

const updateScheduleSchema = scheduleSchema.extend({
  id: z.string().uuid(),
})

export async function createSchedule(formData: unknown) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const validated = scheduleSchema.parse(formData)

    if (validated.reportId) {
      const report = await prisma.reportTemplate.findUnique({
        where: { id: validated.reportId },
      })
      if (!report || report.orgId !== session.user.orgId) {
        return { success: false, error: "Report not found" }
      }
    }

    const nextRunAt = computeNextRunAt(validated.cronExpr)

    const schedule = await prisma.schedule.create({
      data: {
        orgId: session.user.orgId,
        name: validated.name,
        reportId: validated.reportId,
        cronExpr: validated.cronExpr,
        recipients: validated.recipients,
        retryCount: validated.retryCount,
        enabled: true,
        nextRunAt,
      },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "SCHEDULE_CREATED",
      entityType: "schedule",
      entityId: schedule.id,
      details: { name: validated.name, cronExpr: validated.cronExpr },
    })

    return { success: true, id: schedule.id, nextRunAt: schedule.nextRunAt?.toISOString() }
  } catch (error) {
    console.error("Create schedule error:", error)
    const msg = error instanceof z.ZodError ? error.issues[0]?.message : "Failed to create schedule"
    return { success: false, error: msg }
  }
}

export async function updateSchedule(formData: unknown) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const validated = updateScheduleSchema.parse(formData)

    const existing = await prisma.schedule.findUnique({
      where: { id: validated.id },
    })
    if (!existing || existing.orgId !== session.user.orgId) {
      return { success: false, error: "Schedule not found" }
    }

    if (validated.reportId) {
      const report = await prisma.reportTemplate.findUnique({
        where: { id: validated.reportId },
      })
      if (!report || report.orgId !== session.user.orgId) {
        return { success: false, error: "Report not found" }
      }
    }

    const nextRunAt = computeNextRunAt(validated.cronExpr)

    const updated = await prisma.schedule.update({
      where: { id: validated.id },
      data: {
        name: validated.name,
        reportId: validated.reportId,
        cronExpr: validated.cronExpr,
        recipients: validated.recipients,
        retryCount: validated.retryCount,
        nextRunAt,
      },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "SCHEDULE_UPDATED",
      entityType: "schedule",
      entityId: validated.id,
      details: { name: validated.name },
    })

    return { success: true }
  } catch (error) {
    console.error("Update schedule error:", error)
    const msg = error instanceof z.ZodError ? error.issues[0]?.message : "Failed to update schedule"
    return { success: false, error: msg }
  }
}

export async function deleteSchedule(id: string) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const schedule = await prisma.schedule.findUnique({ where: { id } })
    if (!schedule || schedule.orgId !== session.user.orgId) {
      return { success: false, error: "Schedule not found" }
    }

    await prisma.schedule.delete({ where: { id } })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "SCHEDULE_DELETED",
      entityType: "schedule",
      entityId: id,
      details: { name: schedule.name },
    })

    return { success: true }
  } catch (error) {
    console.error("Delete schedule error:", error)
    return { success: false, error: "Failed to delete schedule" }
  }
}

export async function toggleSchedule(id: string, enabled: boolean) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const schedule = await prisma.schedule.findUnique({ where: { id } })
    if (!schedule || schedule.orgId !== session.user.orgId) {
      return { success: false, error: "Schedule not found" }
    }

    const updated = await prisma.schedule.update({
      where: { id },
      data: { enabled, nextRunAt: enabled ? computeNextRunAt(schedule.cronExpr) : null },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "SCHEDULE_TOGGLED",
      entityType: "schedule",
      entityId: id,
      details: { enabled: updated.enabled },
    })

    return { success: true, enabled: updated.enabled }
  } catch (error) {
    console.error("Toggle schedule error:", error)
    return { success: false, error: "Failed to toggle schedule" }
  }
}

export async function runScheduleNow(scheduleId: string) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } })
    if (!schedule || schedule.orgId !== session.user.orgId) {
      return { success: false, error: "Schedule not found" }
    }

    // Persist execution log entry
    const logEntry = await prisma.executionLog.create({
      data: {
        scheduleId,
        status: "RUNNING",
        trigger: "MANUAL",
      },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "SCHEDULE_RUN_NOW",
      entityType: "schedule",
      entityId: scheduleId,
      details: { executionId: logEntry.id },
    })

    // Enqueue a job (placeholder — integrate with BullMQ / Inngest / Vercel Cron in production)
    console.log(`[SCHEDULE] Run-now triggered for schedule ${scheduleId}, execution ${logEntry.id}`)

    return { success: true, executionId: logEntry.id }
  } catch (error) {
    console.error("Run schedule now error:", error)
    return { success: false, error: "Failed to trigger schedule" }
  }
}

export async function retryExecution(executionId: string) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const log = await prisma.executionLog.findUnique({
      where: { id: executionId },
      include: { schedule: true },
    })
    if (!log || log.schedule.orgId !== session.user.orgId) {
      return { success: false, error: "Execution log not found" }
    }

    const retryCount = log.schedule.retryCount
    const retryNum = (log as any).retryNumber ?? 0

    if (retryNum >= retryCount) {
      return { success: false, error: `Max retry count (${retryCount}) reached` }
    }

    await prisma.executionLog.update({
      where: { id: executionId },
      data: {
        status: "RUNNING",
        trigger: "RETRY",
      },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "EXECUTION_RETRY",
      entityType: "execution_log",
      entityId: executionId,
      details: { scheduleId: log.scheduleId },
    })

    console.log(`[SCHEDULE] Retry triggered for execution ${executionId}`)
    return { success: true }
  } catch (error) {
    console.error("Retry execution error:", error)
    return { success: false, error: "Failed to retry execution" }
  }
}

export async function getAllScheduleLogs(scheduleId: string) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } })
  if (!schedule || schedule.orgId !== session.user.orgId) return []

  return prisma.executionLog.findMany({
    where: { scheduleId },
    orderBy: { createdAt: "desc" },
    take: 50,
  })
}
