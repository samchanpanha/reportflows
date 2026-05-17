import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

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
  details?: Prisma.JsonObject
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
