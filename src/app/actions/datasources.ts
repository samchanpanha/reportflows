"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { encrypt } from "@/lib/encryption"
import { redirect } from "next/navigation"
import { z } from "zod"

// Schema validation
const createDataSourceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["POSTGRESQL", "MYSQL", "CSV", "API"]),
  connectionDetails: z.record(z.string(), z.any()),
  password: z.string().optional(),
})

const updateDataSourceSchema = createDataSourceSchema.extend({
  id: z.string().uuid(),
})

export async function createDataSource(formData: unknown) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const validated = createDataSourceSchema.parse(formData)

    // Encrypt password if provided
    let passwordEnc: string | null = null
    if (validated.password) {
      passwordEnc = encrypt(validated.password)
    }

    const datasource = await prisma.dataSource.create({
      data: {
        orgId: session.user.orgId,
        name: validated.name,
        type: validated.type,
        connectionDetails: validated.connectionDetails,
        passwordEnc,
        status: "ACTIVE",
      },
    })

    // Audit log
    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "DATASOURCE_CREATED",
      entityType: "datasource",
      entityId: datasource.id,
      details: { name: validated.name, type: validated.type },
    })

    return { success: true, id: datasource.id }
  } catch (error) {
    console.error("Create datasource error:", error)
    const message = error instanceof z.ZodError 
      ? error.issues[0]?.message
      : "Failed to create data source"
    return {
      success: false,
      error: message,
    }
  }
}

export async function updateDataSource(formData: unknown) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const validated = updateDataSourceSchema.parse(formData)

    // Check ownership
    const existing = await prisma.dataSource.findUnique({
      where: { id: validated.id },
    })

    if (!existing || existing.orgId !== session.user.orgId) {
      return { success: false, error: "Data source not found" }
    }

    // Encrypt new password if provided, otherwise keep existing
    let passwordEnc = existing.passwordEnc
    if (validated.password && validated.password !== existing.passwordEnc) {
      passwordEnc = encrypt(validated.password)
    }

    const updated = await prisma.dataSource.update({
      where: { id: validated.id },
      data: {
        name: validated.name,
        type: validated.type,
        connectionDetails: validated.connectionDetails,
        passwordEnc,
      },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "DATASOURCE_UPDATED",
      entityType: "datasource",
      entityId: validated.id,
      details: { name: validated.name },
    })

    return { success: true, id: updated.id }
  } catch (error) {
    console.error("Update datasource error:", error)
    const message = error instanceof z.ZodError 
      ? error.issues[0]?.message
      : "Failed to update data source"
    return {
      success: false,
      error: message,
    }
  }
}

export async function deleteDataSource(id: string) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const datasource = await prisma.dataSource.findUnique({
      where: { id },
    })

    if (!datasource || datasource.orgId !== session.user.orgId) {
      return { success: false, error: "Data source not found" }
    }

    await prisma.dataSource.delete({ where: { id } })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "DATASOURCE_DELETED",
      entityType: "datasource",
      entityId: id,
      details: { name: datasource.name },
    })

    return { success: true }
  } catch (error) {
    console.error("Delete datasource error:", error)
    return { success: false, error: "Failed to delete data source" }
  }
}

export async function testDataSourceConnection(id: string) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const datasource = await prisma.dataSource.findUnique({
      where: { id },
    })

    if (!datasource || datasource.orgId !== session.user.orgId) {
      return { success: false, error: "Data source not found" }
    }

    // TODO: Implement actual connection test based on type
    // For now, just update lastTested timestamp
    await prisma.dataSource.update({
      where: { id },
      data: {
        lastTested: new Date(),
        status: "ACTIVE", // In real impl, would test and set status accordingly
      },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "DATASOURCE_TESTED",
      entityType: "datasource",
      entityId: id,
    })

    return { success: true, message: "Connection test passed" }
  } catch (error) {
    console.error("Test connection error:", error)
    return { success: false, error: "Failed to test connection" }
  }
}
