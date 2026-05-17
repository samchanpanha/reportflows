/**
 * Pure connection-string helpers.
 * Keep these OUT of any "use server" file to avoid Next.js action-scan false positives.
 */

export function buildPostgresConnStr(details: Record<string, unknown>, passwordPlain?: string): string {
  const host = typeof details.host    === "string" ? details.host    : "localhost"
  const port = typeof details.port    === "number" ? details.port    : 5432
  const db   = typeof details.database === "string"  ? details.database : "postgres"
  const user = typeof details.username === "string"  ? details.username : "postgres"
  const pass = passwordPlain || ""
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${encodeURIComponent(db)}`
}

export function buildMySQLConnStr(details: Record<string, unknown>, passwordPlain?: string): string {
  const host = typeof details.host    === "string" ? details.host    : "localhost"
  const port = typeof details.port    === "number" ? details.port    : 3306
  const db   = typeof details.database === "string"  ? details.database : undefined
  const user = typeof details.username === "string"  ? details.username : "root"
  const pass = passwordPlain || ""
  const base = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`
  return db ? `${base}/${encodeURIComponent(db)}` : base
}

export function substituteParams(sql: string, paramValues: Record<string, string | number> = {}): string {
  let result = sql
  for (const [k, v] of Object.entries(paramValues)) {
    const quoted = typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v)
    result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), quoted)
  }
  return result
}

export function parseJson(val: unknown): Record<string, unknown> {
  return typeof val === "object" && val !== null ? val as Record<string, unknown> : {}
}
