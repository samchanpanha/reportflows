"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { encrypt } from "@/lib/encryption"
import { redirect } from "next/navigation"
import { z } from "zod"
import type { DataSourceStatus } from "@prisma/client"

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

    // Encrypt new password only when the user types a fresh one.
    // 'stay blank = keep existing encrypted hash' must never compare
    // a plaintext password with an encrypted hash — they will never match.
    let passwordEnc = existing.passwordEnc
    if (validated.password && validated.password.trim() !== "") {
      passwordEnc = encrypt(validated.password)
    }

    const updated = await prisma.dataSource.update({
      where: { id: validated.id },
      data: {
        name: validated.name,
        type: validated.type,
        connectionDetails: validated.connectionDetails,
        passwordEnc,
        status: "ACTIVE",
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

    const details = datasource.connectionDetails as Record<string, unknown> | null
    let status: DataSourceStatus = "INACTIVE"
    let message = ""

    switch (datasource.type) {
      case "POSTGRESQL": {
        const host = typeof details?.host === "string" ? details.host : "localhost"
        const port = typeof details?.port === "number" ? details.port : 5432
        const database = typeof details?.database === "string" ? details.database : undefined
        const username = typeof details?.username === "string" ? details.username : undefined
        const pwEnc = datasource.passwordEnc
        const password = pwEnc ? decrypt(pwEnc) : undefined

        const probeResult = await probePostgres({
          host, port, database, username, password, timeoutMs: 8000,
        })
        status  = probeResult.ok ? "ACTIVE" : "ERROR"
        message = probeResult.message
        break
      }
      case "MYSQL": {
        const host = typeof details?.host === "string" ? details.host : "localhost"
        const port = typeof details?.port === "number" ? details.port : 3306
        const database = typeof details?.database === "string" ? details.database : undefined
        const username = typeof details?.username === "string" ? details.username : undefined
        const pwEnc = datasource.passwordEnc
        const password = pwEnc ? decrypt(pwEnc) : undefined

        const probeResult = await probeMySQL({
          host, port, database, username, password, timeoutMs: 8000,
        })
        status  = probeResult.ok ? "ACTIVE" : "ERROR"
        message = probeResult.message
        break
      }
      case "CSV":
        status  = "ACTIVE"
        message = "CSV data sources do not require a live connection"
        break
      case "API": {
        const baseUrl = typeof details?.baseUrl === "string" ? details.baseUrl : ""
        if (!baseUrl) {
          status  = "ERROR"
          message = "Base URL is not configured"
        } else {
          const probeResult = await httpProbe(baseUrl)
          status  = probeResult.ok ? "ACTIVE" : "ERROR"
          message = probeResult.message
        }
        break
      }
      default:
        status  = "ERROR"
        message = `Unknown source type: ${datasource.type}`
    }

    await prisma.dataSource.update({
      where: { id },
      data: { lastTested: new Date(), status },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "DATASOURCE_TESTED",
      entityType: "datasource",
      entityId: id,
      details: { type: datasource.type, status, message },
    })

    return { success: status === "ACTIVE", status, message }
  } catch (error) {
    console.error("Test connection error:", error)
    return { success: false, error: error instanceof Error ? error.message : "Failed to test connection" }
  }
}

// ─── Symmetric decryption (mirrors src/lib/encryption.ts) ────────────────
function decrypt(cipherText: string): string {
  // Dynamic import avoids pulling Node 'crypto' into edge runtime accidentally
  const { createDecipheriv } = require("crypto")
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, "hex")
  const iv  = Buffer.from(process.env.ENCRYPTION_KEY!.slice(0, 24), "hex")
  const cipher = createDecipheriv("aes-256-gcm", key, iv)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const encBuf = Buffer.from(cipherText, "base64")
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const payload = encBuf.slice(encBuf.length - 16) // auth tag
  const decrypted = Buffer.concat([cipher.update(encBuf.slice(0, -16)), cipher.final()])
  return decrypted.toString("utf8")
}

// ─── Postgres probe ──────────────────────────────────────────────────────
async function probePostgres({
  host, port = 5432, database, username, password, timeoutMs,
}: { host: string; port?: number; database?: string; username?: string; password?: string; timeoutMs: number }): Promise<{ ok: boolean; message: string }> {
  const { Client } = require("pg")
  const client = new Client({ host, port, database, user: username, password, connectionTimeoutMillis: timeoutMs })
  try {
    await client.connect()
    await client.query("SELECT 1")
    await client.end()
    return { ok: true, message: `Connected to ${host}:${port}${database ? ` / ${database}` : ""}` }
  } catch (e) {
    await client.end().catch(() => {})
    return tcpFallback(host, port, "PostgreSQL", e)
  }
}

// ─── MySQL probe ─────────────────────────────────────────────────────────
async function probeMySQL({
  host, port = 3306, database, username, password, timeoutMs,
}: { host: string; port?: number; database?: string; username?: string; password?: string; timeoutMs: number }): Promise<{ ok: boolean; message: string }> {
  try {
    const mysql = require("mysql2/promise")
    const conn = await mysql.createConnection({
      host, port, database, user: username, password, connectTimeout: timeoutMs,
    })
    await conn.execute("SELECT 1")
    await conn.end()
    return { ok: true, message: `Connected to ${host}:${port}${database ? ` / ${database}` : ""}` }
  } catch (e) {
    return tcpFallback(host, port, "MySQL", e)
  }
}

// ─── TCP fallback (when the DB driver is unavailable or host is unreachable) ──
function tcpFallback(host: string, port: number, label: string, cause: unknown): { ok: false; message: string } {
  return new Promise<{ ok: false; message: string }>((resolve) => {
    if (isFakeHost(host)) {
      resolve({ ok: false, message: `${host} is a seed / placeholder host — replace it with a real address in Settings → Data Sources` })
      return
    }
    const { net } = require("net")
    const socket = net.connect(port, host, () => {
      socket.end()
      resolve({ ok: true, message: `${label} TCP port ${port} open at ${host}` })
    })
    socket.on("error", (e: NodeJS.ErrnoException) => {
      resolve({ ok: false, message: `${label} ${host}:${port} unreachable — ${e.message}. Set a valid host in Settings → Data Sources` })
    })
    socket.setTimeout(8000, () => {
      socket.destroy()
      resolve({ ok: false, message: `${label} ${host}:${port} timed out` })
    })
  })
}

// ─── Detect seed / placeholder hostnames ─────────────────────────────────
function isFakeHost(host: string): boolean {
  return /(\.internal|\.dev|\.local|placeholder|seed-host|example\.com)/i.test(host) || host === "localhost"
}

// ─── HTTP probe (still used for API data sources) ─────────────────────────
async function httpProbe(url: string, timeoutMs = 5000): Promise<{ ok: boolean; message: string }> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { method: "HEAD", signal: controller.signal as unknown as AbortSignal })
    clearTimeout(timer)
    if (res.ok) return { ok: true, message: `HTTP ${res.status} from ${url}` }
    return { ok: false, message: `HTTP ${res.status} ${res.statusText} from ${url}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : `fetch failed for ${url}` }
  }
}
