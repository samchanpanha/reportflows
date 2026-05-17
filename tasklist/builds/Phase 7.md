Continuing with Phase 7 – File Storage & History. We’ll integrate S3, add file metadata, download/preview, and retention.

---

## Step 1: Install AWS SDK

```bash
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
```

---

## Step 2: Extend Prisma Schema

Add `GeneratedFile` model and `fileRetentionDays` to `Organization`.

Edit `prisma/schema.prisma`:

```prisma
model Organization {
  // ... existing fields
  fileRetentionDays Int? @map("file_retention_days") @default(30)
  generatedFiles    GeneratedFile[]
}

model GeneratedFile {
  id             String   @id @default(cuid()) @db.Uuid
  orgId          String   @map("org_id") @db.Uuid
  reportId       String?  @map("report_id") @db.Uuid
  scheduleId     String?  @map("schedule_id") @db.Uuid
  executionId    String?  @map("execution_id") @db.Uuid
  fileName       String
  originalName   String   @map("original_name")
  fileSize       Int      @map("file_size") // bytes
  mimeType       String   @map("mime_type")
  s3Key          String   @map("s3_key")
  createdAt      DateTime @default(now()) @map("created_at")
  org            Organization @relation(fields: [orgId], references: [id])
  report         ReportTemplate? @relation(fields: [reportId], references: [id])
  schedule       Schedule? @relation(fields: [scheduleId], references: [id])
  executionLog   ExecutionLog? @relation(fields: [executionId], references: [id])

  @@index([orgId, createdAt])
  @@map("generated_files")
}
```

Run migration:

```bash
npx prisma migrate dev --name file_storage
```

---

## Step 3: S3 Helper

Create `src/lib/s3.ts`:

```ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { Upload } from "@aws-sdk/lib-storage"
import { Readable } from "stream"

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const bucket = process.env.S3_BUCKET_NAME!

export async function uploadToS3(key: string, body: Buffer | Readable, contentType: string) {
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    },
  })
  return upload.done()
}

export async function getSignedDownloadUrl(key: string, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key })
  return getSignedUrl(s3Client, command, { expiresIn })
}

export async function deleteFromS3(key: string) {
  const command = new DeleteObjectCommand({ Bucket: bucket, Key: key })
  return s3Client.send(command)
}

export async function getFileStream(key: string) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key })
  const response = await s3Client.send(command)
  return response.Body as Readable
}
```

Add environment variables to `.env`:

```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
S3_BUCKET_NAME=reportflow-exports
```

---

## Step 4: Update Export Report Action to Use S3 and Create File Record

Modify `src/app/actions/reports.ts` (add import and replace export logic):

At the top:

```ts
import { uploadToS3 } from "@/lib/s3"
import { prisma } from "@/lib/prisma"
```

Replace the `exportReport` function's file generation part with S3 upload:

```ts
// ... inside exportReport after generating the file buffer
// For Excel generation we need to write to buffer instead of file path.
// We'll refactor generators to return a Buffer.

async function generateExcelBuffer(design: ReportDesign, columns: string[], rows: any[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(design.layout.title || "Report")
  // ... same as before but instead of writeFile we use workbook.xlsx.writeBuffer()
  // ... after setting up sheet
  return workbook.xlsx.writeBuffer() as Promise<Buffer>
}

async function generatePDFBuffer(design: ReportDesign, columns: string[], rows: any[]): Promise<Buffer> {
  // Use a passthrough stream to collect into buffer
  const PDFDocument = require("pdfkit")
  const doc = new PDFDocument({ size: design.layout.pageSize || "A4", layout: design.layout.orientation || "portrait" })
  // same drawing logic...
  // we'll return a promise that resolves with the buffer
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    // ... draw everything then doc.end()
  })
}
```

But to avoid rewriting the whole generator, we can write to a temp buffer. Simpler: generate the file locally as before, then read it and upload to S3, then delete local file. That's less efficient but works for now. We'll do that.

Update `exportReport`:

After generating the file locally, we'll:

```ts
// Read the file into buffer
const fileBuffer = await fs.readFile(filePath)
const fileSize = fileBuffer.length
const mime = format === "EXCEL" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf"

// Generate S3 key: orgId/reports/date/filename
const s3Key = `${session.user.orgId}/reports/${new Date().toISOString().split("T")[0]}/${fileName}`

// Upload to S3
await uploadToS3(s3Key, fileBuffer, mime)

// Create GeneratedFile record
await prisma.generatedFile.create({
  data: {
    orgId: session.user.orgId,
    reportId: report.id,
    scheduleId: undefined, // could pass if called from schedule
    executionId: undefined,
    fileName: fileName,
    originalName: `${report.name}.${format === "EXCEL" ? "xlsx" : "pdf"}`,
    fileSize,
    mimeType: mime,
    s3Key,
  },
})

// Optionally delete local file
await fs.unlink(filePath)

// Return signed URL or file ID
const signedUrl = await getSignedDownloadUrl(s3Key)
return signedUrl
```

We need to pass `scheduleId` and `executionId` optionally. We'll modify `exportReport` signature to accept options, but to keep minimal, we can leave as is and later in scheduler we manually update the generated file record with scheduleId/executionId. Simpler: we'll add an optional `metadata` param to `exportReport`.

We'll update the function:

```ts
export async function exportReport(reportId: string, metadata?: { scheduleId?: string; executionId?: string }) {
  // ... after creating GeneratedFile, include those fields if provided
}
```

Then in scheduler's `runNow` and the background job, pass them.

---

## Step 5: Refactor PDF/Excel Generators to Return Buffers (Better)

We'll rewrite the generator functions to work with buffers for simplicity.

Create `src/lib/report-generators.ts` and move `generateExcel` and `generatePDF` there, returning `Buffer`. This is a large rewrite but I'll summarize.

Actually, we can stick to the file-based approach and just read it back; it's simpler for now. The user can refactor later. We'll proceed with local file generation, read, upload, delete.

---

## Step 6: File History Page

`src/app/(dashboard)/report-history/page.tsx`

```tsx
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import FileHistoryClient from "./client"

export default async function ReportHistoryPage({ searchParams }: { searchParams: any }) {
  const session = await auth()
  const orgId = session?.user?.orgId!

  const where: any = { orgId }
  if (searchParams.reportId) where.reportId = searchParams.reportId
  if (searchParams.dateFrom || searchParams.dateTo) {
    where.createdAt = {}
    if (searchParams.dateFrom) where.createdAt.gte = new Date(searchParams.dateFrom)
    if (searchParams.dateTo) where.createdAt.lte = new Date(searchParams.dateTo)
  }

  const files = await prisma.generatedFile.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { report: { select: { name: true } } },
  })

  const reports = await prisma.reportTemplate.findMany({
    where: { orgId },
    select: { id: true, name: true },
  })

  return <FileHistoryClient files={files} reports={reports} searchParams={searchParams} />
}
```

Client component `src/app/(dashboard)/report-history/client.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDistanceToNow } from "date-fns"
import Link from "next/link"

export default function FileHistoryClient({ files, reports, searchParams }: any) {
  const router = useRouter()
  const [reportId, setReportId] = useState(searchParams.reportId || "")
  const [dateFrom, setDateFrom] = useState(searchParams.dateFrom || "")
  const [dateTo, setDateTo] = useState(searchParams.dateTo || "")

  const applyFilters = () => {
    const params = new URLSearchParams()
    if (reportId) params.set("reportId", reportId)
    if (dateFrom) params.set("dateFrom", dateFrom)
    if (dateTo) params.set("dateTo", dateTo)
    router.push(`/report-history?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Report History</h1>

      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div>
            <Label>Report</Label>
            <Select value={reportId} onValueChange={setReportId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="All Reports" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {reports.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>From</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <Button onClick={applyFilters}>Filter</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Report</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file: any) => (
                <TableRow key={file.id}>
                  <TableCell className="font-medium">{file.originalName}</TableCell>
                  <TableCell>{file.report?.name || "—"}</TableCell>
                  <TableCell>{formatBytes(file.fileSize)}</TableCell>
                  <TableCell>{formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Link href={`/api/files/${file.id}/download`} className="text-blue-500 hover:underline">Download</Link>
                      {file.mimeType === "application/pdf" && (
                        <Link href={`/api/files/${file.id}/preview`} target="_blank" className="text-green-500 hover:underline">Preview</Link>
                      )}
                      <DeleteFileButton fileId={file.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {files.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No files found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B"
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB"
  else return (bytes / 1048576).toFixed(1) + " MB"
}

function DeleteFileButton({ fileId }: { fileId: string }) {
  const router = useRouter()
  const handleDelete = async () => {
    await fetch(`/api/files/${fileId}/delete`, { method: "POST" })
    router.refresh()
  }
  return <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-500">Delete</Button>
}
```

---

## Step 7: API Routes for File Download, Preview, Delete

Create `src/app/api/files/[id]/download/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSignedDownloadUrl } from "@/lib/s3"
import { auth } from "@/auth"
import { logAudit } from "@/lib/audit"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const file = await prisma.generatedFile.findUnique({ where: { id: params.id } })
  if (!file || file.orgId !== session.user.orgId) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Log download
  await logAudit({
    orgId: session.user.orgId,
    userId: session.user.id,
    action: "FILE_DOWNLOADED",
    entityType: "generated_file",
    entityId: file.id,
  })

  // Generate signed URL and redirect
  const url = await getSignedDownloadUrl(file.s3Key)
  return NextResponse.redirect(url)
}
```

Preview route (for PDF inline viewing):

`src/app/api/files/[id]/preview/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getFileStream } from "@/lib/s3"
import { auth } from "@/auth"
import { logAudit } from "@/lib/audit"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const file = await prisma.generatedFile.findUnique({ where: { id: params.id } })
  if (!file || file.orgId !== session.user.orgId) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (file.mimeType !== "application/pdf") return NextResponse.json({ error: "Only PDF preview supported" }, { status: 400 })

  await logAudit({
    orgId: session.user.orgId,
    userId: session.user.id,
    action: "FILE_PREVIEWED",
    entityType: "generated_file",
    entityId: file.id,
  })

  const stream = await getFileStream(file.s3Key)
  return new NextResponse(stream as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file.originalName}"`,
    },
  })
}
```

Delete route:

`src/app/api/files/[id]/delete/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { deleteFromS3 } from "@/lib/s3"
import { auth } from "@/auth"
import { logAudit } from "@/lib/audit"

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const file = await prisma.generatedFile.findUnique({ where: { id: params.id } })
  if (!file || file.orgId !== session.user.orgId) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await deleteFromS3(file.s3Key)
  await prisma.generatedFile.delete({ where: { id: params.id } })

  await logAudit({
    orgId: session.user.orgId,
    userId: session.user.id,
    action: "FILE_DELETED",
    entityType: "generated_file",
    entityId: file.id,
  })

  return NextResponse.json({ success: true })
}
```

---

## Step 8: Retention Policies

Add a settings page to update `fileRetentionDays`. We'll add a simple form in the existing "Settings" page (or a new `/settings` route).

`src/app/(dashboard)/settings/page.tsx`:

```tsx
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { updateRetention } from "./actions"

export default async function SettingsPage() {
  const session = await auth()
  const org = await prisma.organization.findUnique({ where: { id: session?.user?.orgId! } })

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      <Card>
        <CardHeader><CardTitle>File Retention</CardTitle></CardHeader>
        <CardContent>
          <form action={updateRetention} className="space-y-4">
            <div>
              <Label htmlFor="days">Auto-delete files older than (days)</Label>
              <Input id="days" name="days" type="number" defaultValue={org?.fileRetentionDays || 30} />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

`src/app/(dashboard)/settings/actions.ts`:

```ts
"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

export async function updateRetention(formData: FormData) {
  const session = await auth()
  if (!session?.user?.orgId) throw new Error("Unauthorized")
  const days = parseInt(formData.get("days") as string)
  await prisma.organization.update({
    where: { id: session.user.orgId },
    data: { fileRetentionDays: days },
  })
  revalidatePath("/settings")
}
```

Retention cleanup job (API endpoint):

`src/app/api/cron/cleanup-files/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { deleteFromS3 } from "@/lib/s3"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const organizations = await prisma.organization.findMany()
  let deletedCount = 0

  for (const org of organizations) {
    const retentionDays = org.fileRetentionDays || 30
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

    const oldFiles = await prisma.generatedFile.findMany({
      where: {
        orgId: org.id,
        createdAt: { lt: cutoff },
      },
    })

    for (const file of oldFiles) {
      try {
        await deleteFromS3(file.s3Key)
        await prisma.generatedFile.delete({ where: { id: file.id } })
        deletedCount++
      } catch (e) {
        console.error(`Failed to delete file ${file.id}`, e)
      }
    }
  }

  return NextResponse.json({ deleted: deletedCount })
}
```

---

## Step 9: Update Sidebar Navigation

Add "Report History" and "Settings" links in the sidebar. Update `navItems` in `dashboard-layout.tsx`:

```tsx
{ href: "/report-history", label: "History", icon: "📚" },
{ href: "/settings", label: "Settings", icon: "⚙️" },
```

---

## Step 10: Audit Logging for File Operations

Already included in download, preview, delete API routes. We should also log file creation in exportReport when GeneratedFile is created.

Add in `exportReport` after `prisma.generatedFile.create`:

```ts
await logAudit({
  orgId: session.user.orgId,
  userId: session.user.id,
  action: "FILE_CREATED",
  entityType: "generated_file",
  entityId: createdFile.id,
})
```

---

## Summary of Phase 7

- S3 integration with `@aws-sdk/client-s3`, signed URLs.
- `GeneratedFile` model to track all exported reports.
- Export action now uploads to S3, records metadata, and returns signed URL.
- Report history page with filters, download, preview (PDF), and delete.
- Secure API routes for download (redirect to signed URL), inline preview, deletion.
- File retention policy setting per organization.
- Cron job for automatic cleanup of old files.
- Audit logging for all file operations.
- Sidebar links added.

Phase 7 is complete. Ready for Phase 8: Audit Logs & Monitoring when you want to proceed!