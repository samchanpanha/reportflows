"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { redirect } from "next/navigation"
import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { decrypt } from "@/lib/encryption"
import { buildPostgresConnStr, buildMySQLConnStr, parseJson, substituteParams } from "@/lib/dbHelpers"

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
           parameters: existing.parameters as Prisma.InputJsonValue | undefined,
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

// Save current query SQL as a new history entry BEFORE overwriting
     await prisma.queryVersion.create({
         data: {
           queryId,
           sqlText: query.sqlText,
           parameters: query.parameters as Prisma.InputJsonValue | undefined,
         },
     })

     // Restore the old version's SQL
     const updated = await prisma.query.update({
       where: { id: queryId },
       data: {
         sqlText: version.sqlText,
         parameters: version.parameters as Prisma.InputJsonValue | undefined,
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

// Live SQL execution against a saved query's configured data source.
// Supports POSTGRESQL (pg) and MYSQL (mysql2).
// CSV / API types fall back to placeholder rows so the UI never breaks.

function substituteParams(sql: string, paramValues: Prisma.JsonObject = {}): string {
  let result = sql
  for (const [key, value] of Object.entries(paramValues)) {
    const quoted = typeof value === "string" ? `'${value.replace(/'/g, "''")}'` : String(value)
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), quoted)
  }
  return result
}

const parseJson = (val: Prisma.JsonValue | undefined): Record<string, unknown> =>
  typeof val === "object" && val !== null ? val as Record<string, unknown> : {}

function buildPostgresConnStr(details: Record<string, unknown>, passwordPlain?: string): string {
  const host  = typeof details.host === "string" ? details.host : "localhost"
  const port  = typeof details.port === "number" ? details.port : 5432
  const db    = typeof details.database === "string" ? details.database : "postgres"
  const user  = typeof details.username === "string" ? details.username : "postgres"
  const pass  = passwordPlain || ""
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${encodeURIComponent(db)}`
}

function buildMySQLConnStr(details: Record<string, unknown>, passwordPlain?: string): string {
  const host  = typeof details.host === "string" ? details.host : "localhost"
  const port  = typeof details.port === "number" ? details.port : 3306
  const db    = typeof details.database === "string" ? details.database : undefined
  const user  = typeof details.username === "string" ? details.username : "root"
  const pass  = passwordPlain || ""
  const base  = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`
  return db ? `${base}/${encodeURIComponent(db)}` : base
}

async function authenticate(type: string, details: Record<string, unknown>, passwordPlain?: string): Promise<{ db: unknown; password?: string }> {
  switch (type) {
    case "POSTGRESQL": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Client: PgClient } = require("pg") as unknown as { Client: new (opts: { connectionString: string; statement_timeout: number }) => { connect: () => Promise<void>; end: () => Promise<void> } }
      const connStr = buildPostgresConnStr(details, passwordPlain)
      const client = new PgClient({ connectionString: connStr, statement_timeout: 30_000 })
      await client.connect()
      return { db: client, password: passwordPlain }
    }
    case "MYSQL": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mysql = require("mysql2") as { createConnection: (opts: { connectionString: string }) => Promise<{ execute: (sql: string) => Promise<[Record<string, unknown>[], Array<{ name: string }>]>; destroy: () => void }> }
      const connStr = buildMySQLConnStr(details, passwordPlain)
      const client = await mysql.createConnection({ connectionString: connStr })
      return { db: client, password: passwordPlain }
    }
    case "API":
    case "CSV":
    default:
      throw new Error(`executeQuery is not implemented for type ${type}`)
  }
}

async function runSql(
  db: unknown,
  sql: string,
  type: string,
): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  if (type === "POSTGRESQL") {
    const client = db as { query: (sql: string) => { fields: Array<{ name: string }>; rows: Record<string, unknown>[] } }
    const result = await client.query(sql as string)
    return { columns: result.fields.map(f => f.name), rows: result.rows }
  }
  if (type === "MYSQL") {
    const client = db as { execute: (sql: string) => Promise<[Record<string, unknown>[], Array<{ name: string }>]> }
    const [rows, fields] = await client.execute(sql)
    return { columns: fields.map(f => f.name), rows }
  }
  return { columns: [], rows: [] }
}

async function disconnect(db: unknown, type: string): Promise<void> {
  if (type === "POSTGRESQL") { try { (db as { end: () => Promise<void> }).end() } catch { } }
  if (type === "MYSQL")     { try { await (db as { destroy: () => void }).destroy() } catch { } }
}


// ─── Public API ──────────────────────────────────────────────────────────────────

export async function executeQuery(
  queryId: string,
  paramValues?: Prisma.JsonObject,
): Promise<{ success: boolean; error?: string; rows: Prisma.JsonObject[]; columns: string[]; message?: string }> {
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

    const details = typeof query.dataSource?.connectionDetails === "object"
      ? (query.dataSource.connectionDetails as Prisma.JsonObject)
      : ({} as Prisma.JsonObject)
    const passwordPlain = typeof query.dataSource?.passwordEnc === "string"
      ? decrypt(query.dataSource.passwordEnc)
      : undefined

    const sql = substituteParams(query.sqlText, paramValues as Prisma.JsonObject)

    await logAudit({ orgId: session.user.orgId, userId: session.user.id, action: "QUERY_EXECUTED", entityType: "query", entityId: queryId })

    try {
      const { db } = await authenticate(query.dataSource!.type, parseJson(details), passwordPlain)
      try {
        const { columns, rows } = await runSql(db, sql, query.dataSource!.type)
        await disconnect(db, query.dataSource!.type)
        return { success: true, rows: rows as Prisma.JsonObject[], columns, message: `${rows.length} rows returned` }
      } catch (sqlErr) {
        await disconnect(db, query.dataSource!.type)
        throw sqlErr
      }
    } catch (connErr) {
      console.error("[SQL] Connection/execution failed:", connErr)
      return { success: false, error: connErr instanceof Error ? connErr.message : "Database connection failed", rows: [], columns: [] }
    }
  } catch (error) {
    console.error("Execute query error:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to execute query", rows: [], columns: [] }
  }
}

// Re-export helpers for use in server actions / API routes
export { authenticate, runSql, disconnect, buildPostgresConnStr, buildMySQLConnStr }

