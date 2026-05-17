"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { redirect } from "next/navigation"
import { z } from "zod"

const createQuerySchema = z.object({
  name: z.string().min(1, "Query name is required"),
  description: z.string().optional(),
  dataSourceId: z.string().uuid("Invalid data source"),
  sqlText: z.string().min(1, "SQL text is required"),
  parameters: z.record(z.string(), z.any()).optional(),
})

const updateQuerySchema = createQuerySchema.extend({
  id: z.string().uuid(),
})

export async function createQuery(formData: unknown) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const validated = createQuerySchema.parse(formData)

    // Verify data source ownership
    const datasource = await prisma.dataSource.findUnique({
      where: { id: validated.dataSourceId },
    })

    if (!datasource || datasource.orgId !== session.user.orgId) {
      return { success: false, error: "Data source not found" }
    }

    const query = await prisma.query.create({
      data: {
        orgId: session.user.orgId,
        dataSourceId: validated.dataSourceId,
        name: validated.name,
        description: validated.description,
        sqlText: validated.sqlText,
        parameters: validated.parameters,
      },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "QUERY_CREATED",
      entityType: "query",
      entityId: query.id,
      details: { name: validated.name, dataSourceId: validated.dataSourceId },
    })

    return { success: true, id: query.id }
  } catch (error) {
    console.error("Create query error:", error)
    const message = error instanceof z.ZodError 
      ? error.issues[0]?.message
      : "Failed to create query"
    return { success: false, error: message }
  }
}

export async function updateQuery(formData: unknown) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const validated = updateQuerySchema.parse(formData)

    // Check ownership
    const existing = await prisma.query.findUnique({
      where: { id: validated.id },
    })

    if (!existing || existing.orgId !== session.user.orgId) {
      return { success: false, error: "Query not found" }
    }

    // Verify data source ownership
    const datasource = await prisma.dataSource.findUnique({
      where: { id: validated.dataSourceId },
    })

    if (!datasource || datasource.orgId !== session.user.orgId) {
      return { success: false, error: "Data source not found" }
    }

    // Create version history before updating
    if (existing.sqlText !== validated.sqlText || JSON.stringify(existing.parameters) !== JSON.stringify(validated.parameters)) {
      await prisma.queryVersion.create({
        data: {
          queryId: validated.id,
          sqlText: existing.sqlText,
          parameters: existing.parameters as any,
        },
      })
    }

    const updated = await prisma.query.update({
      where: { id: validated.id },
      data: {
        name: validated.name,
        description: validated.description,
        dataSourceId: validated.dataSourceId,
        sqlText: validated.sqlText,
        parameters: validated.parameters,
      },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "QUERY_UPDATED",
      entityType: "query",
      entityId: validated.id,
      details: { name: validated.name },
    })

    return { success: true, id: updated.id }
  } catch (error) {
    console.error("Update query error:", error)
    const message = error instanceof z.ZodError 
      ? error.issues[0]?.message
      : "Failed to update query"
    return { success: false, error: message }
  }
}

export async function deleteQuery(id: string) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const query = await prisma.query.findUnique({
      where: { id },
    })

    if (!query || query.orgId !== session.user.orgId) {
      return { success: false, error: "Query not found" }
    }

    await prisma.query.delete({ where: { id } })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "QUERY_DELETED",
      entityType: "query",
      entityId: id,
      details: { name: query.name },
    })

    return { success: true }
  } catch (error) {
    console.error("Delete query error:", error)
    return { success: false, error: "Failed to delete query" }
  }
}

export async function getQueryVersions(queryId: string) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const query = await prisma.query.findUnique({
      where: { id: queryId },
    })

    if (!query || query.orgId !== session.user.orgId) {
      return { success: false, error: "Query not found", versions: [] }
    }

    const versions = await prisma.queryVersion.findMany({
      where: { queryId },
      orderBy: { createdAt: "desc" },
    })

    return { success: true, versions }
  } catch (error) {
    console.error("Get versions error:", error)
    return { success: false, error: "Failed to fetch versions", versions: [] }
  }
}

export async function rollbackQueryVersion(queryId: string, versionId: string) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const query = await prisma.query.findUnique({
      where: { id: queryId },
    })

    if (!query || query.orgId !== session.user.orgId) {
      return { success: false, error: "Query not found" }
    }

    const version = await prisma.queryVersion.findUnique({
      where: { id: versionId },
    })

    if (!version || version.queryId !== queryId) {
      return { success: false, error: "Version not found" }
    }

    // Save current version as new history entry
    await prisma.queryVersion.create({
      data: {
        queryId,
        sqlText: query.sqlText,
        parameters: query.parameters as any,
      },
    })

    // Restore version
    const updated = await prisma.query.update({
      where: { id: queryId },
      data: {
        sqlText: version.sqlText,
        parameters: version.parameters as any,
      },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "QUERY_ROLLED_BACK",
      entityType: "query",
      entityId: queryId,
      details: { versionId },
    })

    return { success: true, id: updated.id }
  } catch (error) {
    console.error("Rollback error:", error)
    return { success: false, error: "Failed to rollback query" }
  }
}

// Placeholder for SQL execution - full implementation would require database connection
export async function executeQuery(queryId: string, paramValues?: Record<string, any>) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const query = await prisma.query.findUnique({
      where: { id: queryId },
      include: { dataSource: true },
    })

    if (!query || query.orgId !== session.user.orgId) {
      return { success: false, error: "Query not found", rows: [], columns: [] }
    }

    // TODO: Implement real SQL execution against data source
    // This would involve:
    // 1. Parsing the SQL and replacing {{paramName}} with values
    // 2. Connecting to the data source (PostgreSQL, MySQL, etc)
    // 3. Executing the query
    // 4. Returning columns and rows
    
    console.log("Query execution (placeholder):", { queryId, paramValues })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "QUERY_EXECUTED",
      entityType: "query",
      entityId: queryId,
    })

    return { 
      success: true, 
      rows: [],
      columns: [],
      message: "Query execution not yet implemented"
    }
  } catch (error) {
    console.error("Execute query error:", error)
    return { success: false, error: "Failed to execute query", rows: [], columns: [] }
  }
}
