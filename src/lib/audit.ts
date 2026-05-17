import { prisma } from "@/lib/prisma"

export async function logAudit({
  orgId,
  userId,
  action,
  entityType,
  entityId,
  details,
  ipAddress,
}: {
  orgId: string
  userId?: string
  action: string
  entityType: string
  entityId?: string
  details?: Record<string, any>
  ipAddress?: string
}) {
  await prisma.auditLog.create({
    data: {
      orgId,
      userId,
      action,
      entityType,
      entityId,
      details,
      ipAddress,
    },
  })
}
