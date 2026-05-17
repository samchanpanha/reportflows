import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { decrypt } from "@/lib/encryption"
import { NextResponse } from "next/server"

function parseJson(val: unknown): Record<string, unknown> {
  return typeof val === "object" && val !== null ? val as Record<string, unknown> : {}
}

function buildPostgresConnStr(details: Record<string, unknown>, pw?: string): string {
  const host = typeof details.host === "string" ? details.host : "localhost"
  const port = typeof details.port === "number" ? details.port : 5432
  const db   = typeof details.database === "string" ? details.database : "postgres"
  const user = typeof details.username === "string" ? details.username : "postgres"
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pw || "")}@${host}:${port}/${encodeURIComponent(db)}`
}

function buildMySQLConnStr(details: Record<string, unknown>, pw?: string): string {
  const host = typeof details.host === "string" ? details.host : "localhost"
  const port = typeof details.port === "number" ? details.port : 3306
  const db   = typeof details.database === "string" ? details.database : undefined
  const user = typeof details.username === "string" ? details.username : "root"
  const base = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pw || "")}@${host}:${port}`
  return db ? `${base}/${encodeURIComponent(db)}` : base
}

function substituteParams(sql: string, paramValues: Record<string, string | number> = {}): string {
  let result = sql
  for (const [k, v] of Object.entries(paramValues)) {
    const quoted = typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v)
    result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), quoted)
  }
  return result
}

async function runPostgres(connStr: string, sql: string): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require("pg") as unknown as { Client: new (opts: { connectionString: string; statement_timeout: number }) => { connect: () => Promise<void>; end: () => Promise<void>; query: (sql: string) => { fields: Array<{ name: string }>; rows: Record<string, unknown>[] } } }
  const client = new Client({ connectionString: connStr, statement_timeout: 30_000 })
  await client.connect()
  try {
    const res = await client.query(sql)
    return { columns: res.fields.map((f: { name: string }) => f.name), rows: res.rows }
  } finally { await client.end() }
}

async function runMySQL(connStr: string, sql: string): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mysql = require("mysql2") as unknown as { createConnection: (opts: { connectionString: string }) => Promise<{ execute: (sql: string) => Promise<[Record<string, unknown>[], Array<{ name: string }>]>; destroy: () => void }> }
  const client = await mysql.createConnection({ connectionString: connStr })
  try {
    const [rows] = await client.execute(sql)
    const fields = (client as unknown as { _fields?: Array<{ name: string }> })._fields || []
    return { columns: fields.map(f => f.name), rows: rows as Record<string, unknown>[] }
  } finally { await (client as { destroy: () => void }).destroy() }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const paramValues: Record<string, string | number> = body.paramValues || {}

    const query = await prisma.query.findUnique({
      where: { id },
      include: { dataSource: true },
    })
    if (!query || query.orgId !== session.user.orgId) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 })
    }

    const details = parseJson(query.dataSource?.connectionDetails)
    const pwPlain  = typeof query.dataSource?.passwordEnc === "string" ? decrypt(query.dataSource.passwordEnc) : undefined
    const sql      = substituteParams(query.sqlText, paramValues)

    await logAudit({
      orgId: session.user.orgId, userId: session.user.id,
      action: "QUERY_EXECUTED", entityType: "query", entityId: id,
    })

    try {
      switch (query.dataSource!.type) {
        case "POSTGRESQL": {
          const connStr = buildPostgresConnStr(details, pwPlain)
          const result  = await runPostgres(connStr, sql)
          return NextResponse.json({ ...result, message: `${result.rows.length} rows` })
        }
        case "MYSQL": {
          const connStr = buildMySQLConnStr(details, pwPlain)
          const result  = await runMySQL(connStr, sql)
          return NextResponse.json({ ...result, message: `${result.rows.length} rows` })
        }
        default:
          return NextResponse.json({
            columns: [], rows: [],
            message: "Execute is not supported for CSV / API data sources",
          })
      }
    } catch (sqlErr) {
      console.error("[EXECUTE QUERY]", sqlErr)
      return NextResponse.json({
        columns: [], rows: [],
        error: sqlErr instanceof Error ? sqlErr.message : "Query execution failed",
      }, { status: 400 })
    }
  } catch (error) {
    console.error("Execute query error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
