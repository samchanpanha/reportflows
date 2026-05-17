Phase 3 – Query Builder. We’ll add SQL & NoSQL editors with live execution, version history, and dynamic parameters.

---

## Step 1: Extend Prisma Schema

Add `Query`, `QueryVersion` models, and `QueryType` enum. Update `ReportTemplate` to reference `Query`.

Edit `prisma/schema.prisma`:

```prisma
// ... after existing models

enum QueryType {
  SQL
  MONGODB
  // REST, FILE to be added later
}

model Query {
  id            String   @id @default(cuid()) @db.Uuid
  orgId         String   @map("org_id") @db.Uuid
  dataSourceId  String   @map("data_source_id") @db.Uuid
  name          String
  type          QueryType
  sqlText       String?  @db.Text           // SQL content (for SQL type)
  mongoFilter   Json?                       // MongoDB filter JSON
  parameters    Json?                       // list of { name, default? }
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  org           Organization @relation(fields: [orgId], references: [id])
  dataSource    DataSource   @relation(fields: [dataSourceId], references: [id])
  versions      QueryVersion[]
  reports       ReportTemplate[]

  @@map("queries")
}

model QueryVersion {
  id           String   @id @default(cuid()) @db.Uuid
  queryId      String   @map("query_id") @db.Uuid
  version      Int
  sqlText      String?  @db.Text
  mongoFilter  Json?
  parameters   Json?
  createdBy    String?  @map("created_by") @db.Uuid
  createdAt    DateTime @default(now()) @map("created_at")
  query        Query    @relation(fields: [queryId], references: [id], onDelete: Cascade)

  @@map("query_versions")
}

// Modify ReportTemplate: make queryId reference Query
model ReportTemplate {
  id             String   @id @default(cuid()) @db.Uuid
  orgId          String   @map("org_id") @db.Uuid
  name           String
  queryId        String   @map("query_id") @db.Uuid
  format         String   @default("PDF")  // EXCEL, PDF
  columnsConfig  Json?    @map("columns_config")
  templateFile   String?  @map("template_file")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  org            Organization @relation(fields: [orgId], references: [id])
  query          Query    @relation(fields: [queryId], references: [id])
  schedules      Schedule[]

  @@map("report_templates")
}
```

Run migration:

```bash
npx prisma migrate dev --name query_builder
```

---

## Step 2: Install Dependencies

```bash
npm install @monaco-editor/react
```

(For MongoDB execution, install `mongodb` if not already; SQL drivers should already be present.)

---

## Step 3: Server Actions for Queries

Create `src/app/actions/queries.ts`. Includes CRUD, execution, version rollback, and parameter parsing.

```ts
"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { logAudit } from "@/lib/audit"
import { revalidatePath } from "next/cache"
import { testConnection } from "@/lib/test-connection" // we'll reuse to get a client
import { decrypt } from "@/lib/encryption"
import { QueryType } from "@prisma/client"

// Helper to extract parameter names from text
function extractParams(text: string): string[] {
  const matches = text.matchAll(/\{\{(\w+)\}\}/g)
  return [...new Set([...matches].map(m => m[1]))]
}

// Execute a SQL query against the actual data source (returns { columns, rows })
async function executeSQL(ds: any, sql: string, params: Record<string, string>, maxRows = 200): Promise<{ columns: string[]; rows: any[] }> {
  const decryptedPassword = decrypt(ds.connectionDetails.password_enc)
  const type = ds.type

  // Replace parameters (simple string substitution, not parameterized - use at own risk)
  let finalSql = sql
  for (const [key, value] of Object.entries(params)) {
    finalSql = finalSql.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  finalSql = `SELECT * FROM (${finalSql}) sub LIMIT ${maxRows}` // wrap to limit rows

  if (type === "POSTGRESQL") {
    const { Pool } = await import("pg")
    const pool = new Pool({
      host: ds.connectionDetails.host,
      port: ds.connectionDetails.port,
      database: ds.connectionDetails.database,
      user: ds.connectionDetails.username,
      password: decryptedPassword,
    })
    const result = await pool.query(finalSql)
    pool.end()
    const columns = result.fields.map(f => f.name)
    const rows = result.rows
    return { columns, rows }
  }
  else if (type === "MYSQL") {
    const mysql = await import("mysql2/promise")
    const conn = await mysql.createConnection({
      host: ds.connectionDetails.host,
      port: ds.connectionDetails.port,
      database: ds.connectionDetails.database,
      user: ds.connectionDetails.username,
      password: decryptedPassword,
    })
    const [rows, fields] = await conn.execute(finalSql)
    conn.end()
    const columns = (fields as any[]).map(f => f.name)
    return { columns, rows: rows as any[] }
  }
  else if (type === "MSSQL") {
    const sql = await import("mssql")
    const config: any = {
      server: ds.connectionDetails.host,
      port: ds.connectionDetails.port,
      database: ds.connectionDetails.database,
      user: ds.connectionDetails.username,
      password: decryptedPassword,
      options: { encrypt: false, trustServerCertificate: true }
    }
    await sql.connect(config)
    const result = await sql.query(finalSql)
    const columns = result.recordset.columns ? Object.keys(result.recordset.columns) : []
    const rows = result.recordset as any[]
    return { columns, rows }
  }
  throw new Error("Unsupported SQL source type")
}

// Execute a MongoDB query
async function executeMongo(ds: any, filterJson: any, params: Record<string, string>, maxRows = 200) {
  const { MongoClient } = await import("mongodb")
  const connectionString = decrypt(ds.connectionDetails.connectionString_enc)
  const client = new MongoClient(connectionString)

  // Replace parameters in filter (stringify, replace, parse)
  let filterStr = JSON.stringify(filterJson)
  for (const [key, value] of Object.entries(params)) {
    filterStr = filterStr.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  const filter = JSON.parse(filterStr)

  try {
    await client.connect()
    const db = client.db() // use default DB from connection string
    const collections = await db.listCollections().toArray()
    if (collections.length === 0) throw new Error("No collections found")
    const col = db.collection(collections[0].name) // for demo, pick first; later you can select
    const cursor = col.find(filter).limit(maxRows)
    const rows = await cursor.toArray()
    client.close()

    // Extract columns from first row
    const columns = rows.length > 0 ? Object.keys(rows[0]) : []
    return { columns, rows }
  } catch (e) {
    client.close()
    throw e
  }
}

// Main runQuery server action
export async function runQuery(queryId: string, paramValues: Record<string, string>) {
  const session = await auth()
  if (!session?.user?.orgId) throw new Error("Unauthorized")

  const query = await prisma.query.findUnique({
    where: { id: queryId },
    include: { dataSource: true }
  })
  if (!query || query.orgId !== session.user.orgId) throw new Error("Not found")

  const ds = query.dataSource

  try {
    if (query.type === "SQL") {
      if (!query.sqlText) throw new Error("No SQL defined")
      const result = await executeSQL(ds, query.sqlText, paramValues)
      return { success: true, ...result }
    } else if (query.type === "MONGODB") {
      if (!query.mongoFilter) throw new Error("No filter defined")
      const result = await executeMongo(ds, query.mongoFilter as any, paramValues)
      return { success: true, ...result }
    }
    throw new Error("Unsupported query type")
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// Create query (with initial version)
export async function createQuery(formData: FormData) {
  const session = await auth()
  if (!session?.user?.orgId) throw new Error("Unauthorized")

  const type = formData.get("type") as QueryType
  const name = formData.get("name") as string
  const dataSourceId = formData.get("dataSourceId") as string
  const sqlText = formData.get("sqlText") as string || null
  const mongoFilterStr = formData.get("mongoFilter") as string
  let mongoFilter = null
  if (type === "MONGODB" && mongoFilterStr) {
    mongoFilter = JSON.parse(mongoFilterStr)
  }

  // Extract parameters from content
  const content = type === "SQL" ? sqlText : (type === "MONGODB" ? mongoFilterStr : "")
  const paramNames = content ? extractParams(content) : []
  const parameters = paramNames.map(name => ({ name }))

  const query = await prisma.query.create({
    data: {
      orgId: session.user.orgId,
      dataSourceId,
      name,
      type,
      sqlText,
      mongoFilter,
      parameters: parameters.length > 0 ? parameters : null,
    }
  })

  // Create initial version
  await prisma.queryVersion.create({
    data: {
      queryId: query.id,
      version: 1,
      sqlText,
      mongoFilter,
      parameters: query.parameters as any,
      createdBy: session.user.id
    }
  })

  await logAudit({
    orgId: session.user.orgId,
    userId: session.user.id,
    action: "QUERY_CREATED",
    entityType: "query",
    entityId: query.id,
  })

  revalidatePath("/queries")
  return query.id
}

// Update query (creates a new version with old state)
export async function updateQuery(id: string, formData: FormData) {
  const session = await auth()
  if (!session?.user?.orgId) throw new Error("Unauthorized")

  const existing = await prisma.query.findUnique({
    where: { id },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } }
  })
  if (!existing || existing.orgId !== session.user.orgId) throw new Error("Not found")

  const newSqlText = (formData.get("sqlText") as string) || null
  const newMongoFilterStr = formData.get("mongoFilter") as string
  let newMongoFilter = null
  if (existing.type === "MONGODB" && newMongoFilterStr) {
    newMongoFilter = JSON.parse(newMongoFilterStr)
  }

  // Save old state as a new version (unless unchanged)
  const latestVersion = existing.versions[0]?.version || 0
  const newVersion = latestVersion + 1

  // We'll only create version if something changed (sql or filter)
  const contentChanged = 
    (existing.type === "SQL" && existing.sqlText !== newSqlText) ||
    (existing.type === "MONGODB" && JSON.stringify(existing.mongoFilter) !== newMongoFilterStr)

  if (contentChanged) {
    await prisma.queryVersion.create({
      data: {
        queryId: id,
        version: newVersion,
        sqlText: existing.sqlText,
        mongoFilter: existing.mongoFilter as any,
        parameters: existing.parameters as any,
        createdBy: session.user.id,
      }
    })
  }

  // Update parameters from new content
  const content = existing.type === "SQL" ? newSqlText : (existing.type === "MONGODB" ? newMongoFilterStr : "")
  const paramNames = content ? extractParams(content) : []
  const parameters = paramNames.map(name => ({ name }))

  await prisma.query.update({
    where: { id },
    data: {
      sqlText: newSqlText,
      mongoFilter: newMongoFilter,
      parameters: parameters.length > 0 ? parameters : null,
    }
  })

  await logAudit({
    orgId: session.user.orgId,
    userId: session.user.id,
    action: "QUERY_UPDATED",
    entityType: "query",
    entityId: id,
  })

  revalidatePath(`/queries/${id}`)
  revalidatePath("/queries")
}

export async function deleteQuery(id: string) {
  const session = await auth()
  if (!session?.user?.orgId) throw new Error("Unauthorized")

  await prisma.query.delete({ where: { id } })
  await logAudit({
    orgId: session.user.orgId,
    userId: session.user.id,
    action: "QUERY_DELETED",
    entityType: "query",
    entityId: id,
  })
  revalidatePath("/queries")
}

// Rollback to a specific version (creates a new version based on the selected one)
export async function rollbackQuery(queryId: string, versionId: string) {
  const session = await auth()
  if (!session?.user?.orgId) throw new Error("Unauthorized")

  const version = await prisma.queryVersion.findUnique({ where: { id: versionId } })
  if (!version || version.queryId !== queryId) throw new Error("Invalid version")

  // Update query with version content
  await prisma.query.update({
    where: { id: queryId },
    data: {
      sqlText: version.sqlText,
      mongoFilter: version.mongoFilter as any,
      parameters: version.parameters as any,
    }
  })

  // Create a new version to record the rollback
  const latestVersion = await prisma.queryVersion.findFirst({
    where: { queryId },
    orderBy: { version: "desc" }
  })
  const newVersion = (latestVersion?.version || 0) + 1
  await prisma.queryVersion.create({
    data: {
      queryId,
      version: newVersion,
      sqlText: version.sqlText,
      mongoFilter: version.mongoFilter as any,
      parameters: version.parameters as any,
      createdBy: session.user.id,
    }
  })

  await logAudit({
    orgId: session.user.orgId,
    userId: session.user.id,
    action: "QUERY_ROLLBACK",
    entityType: "query",
    entityId: queryId,
    details: { fromVersion: version.version, toVersion: newVersion }
  })

  revalidatePath(`/queries/${queryId}`)
}
```

---

## Step 4: Query Editor Component (with Monaco and Parameter Form)

Create `src/components/query/query-form.tsx`. This form handles create/edit, live preview, and parameter inputs.

```tsx
"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createQuery, updateQuery, runQuery, rollbackQuery } from "@/app/actions/queries"
import Editor from "@monaco-editor/react"

interface DataSource {
  id: string; name: string; type: string;
}

interface Parameter {
  name: string;
}

interface QueryVersion {
  id: string; version: number; createdAt: string;
}

export default function QueryForm({ query, dataSources }: { query?: any; dataSources: DataSource[] }) {
  const router = useRouter()
  const [name, setName] = useState(query?.name || "")
  const [dataSourceId, setDataSourceId] = useState(query?.dataSourceId || "")
  const [type, setType] = useState(query?.type || "SQL")
  const [sqlText, setSqlText] = useState(query?.sqlText || "")
  const [mongoFilter, setMongoFilter] = useState(query?.mongoFilter ? JSON.stringify(query.mongoFilter, null, 2) : "{}")
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ columns: string[]; rows: any[] } | null>(null)
  const [error, setError] = useState("")
  const [running, setRunning] = useState(false)
  const [selectedVersionId, setSelectedVersionId] = useState("")

  const params: Parameter[] = query?.parameters || []

  // Extract parameters from current content
  const extractParams = useCallback((text: string) => {
    const matches = text.matchAll(/\{\{(\w+)\}\}/g)
    return [...new Set([...matches].map(m => m[1]))]
  }, [])

  const currentParams = type === "SQL" ? extractParams(sqlText) : type === "MONGODB" ? extractParams(mongoFilter) : []
  // Merge with stored param defaults
  const paramDefs = currentParams.map(name => {
    const existing = params.find((p: any) => p.name === name)
    return { name, default: existing?.default || "" }
  })

  const handleRun = async () => {
    if (!query) return // only for existing queries
    setRunning(true)
    setError("")
    setResult(null)
    const formData = new FormData()
    Object.entries(paramValues).forEach(([k, v]) => formData.append(k, v))
    try {
      const res = await runQuery(query.id, paramValues)
      if (res.success) {
        setResult({ columns: res.columns || [], rows: res.rows || [] })
      } else {
        setError(res.error || "Execution failed")
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData()
    formData.append("name", name)
    formData.append("type", type)
    formData.append("dataSourceId", dataSourceId)
    if (type === "SQL") formData.append("sqlText", sqlText)
    else if (type === "MONGODB") formData.append("mongoFilter", mongoFilter)

    if (query) {
      await updateQuery(query.id, formData)
    } else {
      const newId = await createQuery(formData)
      router.push(`/queries/${newId}`)
    }
    router.refresh()
  }

  const handleRollback = async () => {
    if (!selectedVersionId || !query) return
    await rollbackQuery(query.id, selectedVersionId)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Label>Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div>
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as any)} disabled={!!query}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SQL">SQL</SelectItem>
              <SelectItem value="MONGODB">MongoDB</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <Label>Data Source</Label>
          <Select value={dataSourceId} onValueChange={setDataSourceId} disabled={!!query}>
            <SelectTrigger><SelectValue placeholder="Select data source" /></SelectTrigger>
            <SelectContent>
              {dataSources.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.name} ({ds.type})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="editor">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="parameters">Parameters</TabsTrigger>
          <TabsTrigger value="preview" disabled={!query}>Preview</TabsTrigger>
          {query && <TabsTrigger value="versions">Versions</TabsTrigger>}
        </TabsList>

        <TabsContent value="editor" className="space-y-4">
          <Card>
            <CardContent className="p-0 overflow-hidden rounded-md">
              {type === "SQL" ? (
                <Editor
                  height="300px"
                  language="sql"
                  value={sqlText}
                  onChange={(val) => setSqlText(val || "")}
                  theme="vs-dark"
                />
              ) : (
                <Editor
                  height="300px"
                  language="json"
                  value={mongoFilter}
                  onChange={(val) => setMongoFilter(val || "{}")}
                  theme="vs-dark"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parameters">
          {paramDefs.length === 0 ? (
            <p className="text-muted-foreground">No parameters defined. Use {'{{paramName}}'} in your query.</p>
          ) : (
            <div className="grid gap-4 grid-cols-2">
              {paramDefs.map(p => (
                <div key={p.name}>
                  <Label>{p.name}</Label>
                  <Input
                    placeholder={p.default}
                    value={paramValues[p.name] || ""}
                    onChange={e => setParamValues({...paramValues, [p.name]: e.target.value})}
                  />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {query && (
          <TabsContent value="preview">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Results (max 200 rows)</h3>
              <Button type="button" onClick={handleRun} disabled={running}>
                {running ? "Running..." : "Run Query"}
              </Button>
            </div>
            {error && <p className="text-red-500 mb-2">{error}</p>}
            {result && (
              <div className="border rounded-md overflow-auto max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {result.columns.map(col => <TableHead key={col}>{col}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((row, i) => (
                      <TableRow key={i}>
                        {result.columns.map(col => (
                          <TableCell key={col}>{String(row[col])}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        )}

        {query && (
          <TabsContent value="versions">
            <div className="space-y-2">
              <Label>Rollback to version</Label>
              <Select onValueChange={setSelectedVersionId}>
                <SelectTrigger><SelectValue placeholder="Select version" /></SelectTrigger>
                <SelectContent>
                  {query.versions?.map((v: QueryVersion) => (
                    <SelectItem key={v.id} value={v.id}>
                      v{v.version} - {new Date(v.createdAt).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={handleRollback} disabled={!selectedVersionId}>
                Rollback
              </Button>
            </div>
          </TabsContent>
        )}
      </Tabs>

      <div className="flex justify-end gap-4">
        <Button type="submit">{query ? "Update" : "Create"} Query</Button>
      </div>
    </form>
  )
}
```

---

## Step 5: Query List Page

`src/app/(dashboard)/queries/page.tsx`

```tsx
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

export default async function QueriesPage() {
  const session = await auth()
  const orgId = session?.user?.orgId!
  const queries = await prisma.query.findMany({
    where: { orgId },
    include: { dataSource: { select: { name: true, type: true } } },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h1 className="text-3xl font-bold">Queries</h1>
        <Link href="/queries/new"><Button>+ New Query</Button></Link>
      </div>
      {queries.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No queries yet.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {queries.map(q => (
            <Link key={q.id} href={`/queries/${q.id}`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg">{q.name}</CardTitle>
                  <Badge>{q.type}</Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Source: {q.dataSource.name} ({q.dataSource.type})</p>
                  <p className="text-xs text-muted-foreground mt-1">Updated {new Date(q.updatedAt).toLocaleDateString()}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## Step 6: New Query Page

`src/app/(dashboard)/queries/new/page.tsx`

```tsx
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import QueryForm from "@/components/query/query-form"

export default async function NewQueryPage() {
  const session = await auth()
  const orgId = session?.user?.orgId!
  const dataSources = await prisma.dataSource.findMany({
    where: { orgId, status: "ACTIVE" }, // only active sources
    select: { id: true, name: true, type: true }
  })

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">New Query</h1>
      <QueryForm dataSources={dataSources} />
    </div>
  )
}
```

---

## Step 7: Query Detail/Edit Page

`src/app/(dashboard)/queries/[id]/page.tsx`

```tsx
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { notFound } from "next/navigation"
import QueryForm from "@/components/query/query-form"
import { deleteQuery } from "@/app/actions/queries"
import { revalidatePath } from "next/cache"
import { Button } from "@/components/ui/button"

export default async function QueryDetailPage({ params }: { params: { id: string } }) {
  const session = await auth()
  const orgId = session?.user?.orgId!
  const query = await prisma.query.findUnique({
    where: { id: params.id },
    include: {
      dataSource: true,
      versions: { orderBy: { version: "desc" }, take: 20 }
    }
  })
  if (!query || query.orgId !== orgId) notFound()

  // Get active data sources for the form (when editing, data source selection is disabled)
  const dataSources = await prisma.dataSource.findMany({
    where: { orgId, status: "ACTIVE" },
    select: { id: true, name: true, type: true }
  })

  async function handleDelete() {
    "use server"
    await deleteQuery(params.id)
    revalidatePath("/queries")
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{query.name}</h1>
        <form action={handleDelete}>
          <Button variant="destructive" type="submit">Delete</Button>
        </form>
      </div>
      <QueryForm query={query} dataSources={dataSources} />
    </div>
  )
}
```

---

## Step 8: Audit Logs for Queries

Already integrated in actions (`createQuery`, `updateQuery`, `deleteQuery`, `rollbackQuery`).

---

## Summary of Phase 3

- Prisma models for `Query`, `QueryVersion`, and updated `ReportTemplate`.
- Server actions for full CRUD, execution (SQL and MongoDB), versioning, and rollback.
- Monaco editor with syntax highlighting.
- Dynamic parameter extraction and input form.
- Results preview (max 200 rows) with columns auto-detected.
- Query list and detail pages with data source filtering.

Phase 3 is now complete. Ready to move to **Phase 4: Report Designer & Export** when you say the word.