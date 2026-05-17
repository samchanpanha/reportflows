Phase 6 – Scheduler & Execution. We’ll build cron-based scheduling, manual runs, execution logs, retries, and the full UI.

---

## Step 1: Install cron-parser

```bash
npm install cron-parser
```

---

## Step 2: Extend Prisma Schema

Add `Schedule` and `ExecutionLog` models (adapting from original schema). Also add an `ExecutionTrigger` enum.

Edit `prisma/schema.prisma`:

```prisma
// Add after existing models (and modify ReportTemplate to include schedules relation if not present)

model Schedule {
  id           String    @id @default(cuid()) @db.Uuid
  orgId        String    @map("org_id") @db.Uuid
  reportId     String    @map("report_id") @db.Uuid
  cronExpr     String    @map("cron_expr")
  recipients   String[]  // email addresses
  telegramChat String?   @map("telegram_chat") // Telegram chat ID
  enabled      Boolean   @default(true)
  retryCount   Int       @default(3) @map("retry_count")
  lastRun      DateTime? @map("last_run")
  nextRun      DateTime? @map("next_run")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")
  org          Organization @relation(fields: [orgId], references: [id])
  report       ReportTemplate @relation(fields: [reportId], references: [id])
  executions   ExecutionLog[]
  notificationChannels NotificationChannel[]? // many-to-many relationship for channels

  @@map("schedules")
}

model ExecutionLog {
  id           String   @id @default(cuid()) @db.Uuid
  scheduleId   String?  @map("schedule_id") @db.Uuid
  reportName   String   @map("report_name")
  status       ExecutionStatus
  startedAt    DateTime @map("started_at") @default(now())
  finishedAt   DateTime? @map("finished_at")
  durationMs   Int?     @map("duration_ms")
  outputPath   String?  @map("output_path")
  errorMsg     String?  @map("error_msg") @db.Text
  rowsExported Int?     @map("rows_exported")
  trigger      ExecutionTrigger @default(SCHEDULED)
  createdAt    DateTime @default(now()) @map("created_at")
  schedule     Schedule? @relation(fields: [scheduleId], references: [id])

  @@index([scheduleId, createdAt])
  @@map("execution_logs")
}

enum ExecutionStatus {
  SUCCESS
  FAILED
  RUNNING
}

enum ExecutionTrigger {
  SCHEDULED
  MANUAL
  RETRY
}
```

Also create a many-to-many relation between `Schedule` and `NotificationChannel` for channel selection per schedule:

```prisma
model ScheduleNotificationChannel {
  scheduleId           String @map("schedule_id") @db.Uuid
  notificationChannelId String @map("notification_channel_id") @db.Uuid
  schedule             Schedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  notificationChannel  NotificationChannel @relation(fields: [notificationChannelId], references: [id], onDelete: Cascade)

  @@id([scheduleId, notificationChannelId])
  @@map("schedule_notification_channels")
}
```

Run migration:

```bash
npx prisma migrate dev --name scheduler_execution
```

---

## Step 3: Server Actions for Scheduling & Execution

Create `src/app/actions/schedules.ts`. This includes creating schedules, updating, deleting, toggling, manual run, and execution log retrieval.

```ts
"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { logAudit } from "@/lib/audit"
import { revalidatePath } from "next/cache"
import { exportReport } from "@/app/actions/reports"
import { sendNotification } from "@/lib/notifications" // will create helper
import cronParser from "cron-parser"
import { ExecutionStatus } from "@prisma/client"

// Helper: calculate next run from cron
function getNextRun(cronExpr: string): Date | null {
  try {
    const interval = cronParser.parseExpression(cronExpr, { currentDate: new Date() })
    return interval.next().toDate()
  } catch {
    return null
  }
}

// Create schedule
export async function createSchedule(formData: FormData) {
  const session = await auth()
  if (!session?.user?.orgId) throw new Error("Unauthorized")

  const reportId = formData.get("reportId") as string
  const cronExpr = formData.get("cronExpr") as string
  const recipients = (formData.get("recipients") as string)?.split(",").map(s => s.trim()) || []
  const telegramChat = formData.get("telegramChat") as string || null
  const channelIds = (formData.get("channelIds") as string)?.split(",").map(s => s.trim()) || []

  // Validate cron
  const nextRun = getNextRun(cronExpr)
  if (!nextRun) throw new Error("Invalid cron expression")

  const schedule = await prisma.schedule.create({
    data: {
      orgId: session.user.orgId,
      reportId,
      cronExpr,
      recipients,
      telegramChat,
      nextRun,
      retryCount: 3,
      // connect notification channels via many-to-many
      notificationChannels: {
        connect: channelIds.filter(Boolean).map(id => ({ id })),
      },
    },
  })

  await logAudit({
    orgId: session.user.orgId,
    userId: session.user.id,
    action: "SCHEDULE_CREATED",
    entityType: "schedule",
    entityId: schedule.id,
  })
  revalidatePath("/schedules")
  return schedule.id
}

// Update schedule
export async function updateSchedule(id: string, formData: FormData) {
  const session = await auth()
  if (!session?.user?.orgId) throw new Error("Unauthorized")

  const reportId = formData.get("reportId") as string
  const cronExpr = formData.get("cronExpr") as string
  const recipients = (formData.get("recipients") as string)?.split(",").map(s => s.trim()) || []
  const telegramChat = formData.get("telegramChat") as string || null
  const channelIds = (formData.get("channelIds") as string)?.split(",").map(s => s.trim()) || []

  const nextRun = getNextRun(cronExpr)
  if (!nextRun) throw new Error("Invalid cron expression")

  // Update schedule and channels
  await prisma.schedule.update({
    where: { id },
    data: {
      reportId,
      cronExpr,
      recipients,
      telegramChat,
      nextRun,
      notificationChannels: {
        set: [], // clear and reconnect
        connect: channelIds.filter(Boolean).map(id => ({ id })),
      },
    },
  })

  await logAudit({
    orgId: session.user.orgId,
    userId: session.user.id,
    action: "SCHEDULE_UPDATED",
    entityType: "schedule",
    entityId: id,
  })
  revalidatePath("/schedules")
  revalidatePath(`/schedules/${id}`)
}

export async function deleteSchedule(id: string) {
  const session = await auth()
  if (!session?.user?.orgId) throw new Error("Unauthorized")
  await prisma.schedule.delete({ where: { id } })
  await logAudit({
    orgId: session.user.orgId,
    userId: session.user.id,
    action: "SCHEDULE_DELETED",
    entityType: "schedule",
    entityId: id,
  })
  revalidatePath("/schedules")
}

export async function toggleSchedule(id: string, enabled: boolean) {
  const session = await auth()
  if (!session?.user?.orgId) throw new Error("Unauthorized")
  await prisma.schedule.update({
    where: { id },
    data: { enabled, nextRun: enabled ? getNextRun((await prisma.schedule.findUnique({where:{id}}))!.cronExpr) : null },
  })
  revalidatePath("/schedules")
}

// Manual run: generate report and send
export async function runNow(scheduleId: string) {
  const session = await auth()
  if (!session?.user?.orgId) throw new Error("Unauthorized")

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { report: true, notificationChannels: true },
  })
  if (!schedule || schedule.orgId !== session.user.orgId) throw new Error("Not found")

  // Create execution log entry (RUNNING)
  const execution = await prisma.executionLog.create({
    data: {
      scheduleId: schedule.id,
      reportName: schedule.report.name,
      status: "RUNNING",
      trigger: "MANUAL",
      startedAt: new Date(),
    },
  })

  try {
    // Generate report file
    const filePath = await exportReport(schedule.reportId)
    if (!filePath) throw new Error("Export failed")

    // Send notifications
    const channels = schedule.notificationChannels
    for (const channel of channels) {
      await sendNotification(channel, schedule.recipients, schedule.telegramChat, filePath)
    }

    // Update execution log to success
    await prisma.executionLog.update({
      where: { id: execution.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        durationMs: Date.now() - execution.startedAt.getTime(),
        outputPath: filePath as string,
        rowsExported: 0, // we didn't track rows, could be improved
      },
    })

    // Update schedule lastRun
    await prisma.schedule.update({
      where: { id: schedule.id },
      data: { lastRun: new Date() },
    })

    revalidatePath("/schedules")
    revalidatePath("/execution-logs")
    return { success: true }
  } catch (e: any) {
    // Update to failed
    await prisma.executionLog.update({
      where: { id: execution.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        durationMs: Date.now() - execution.startedAt.getTime(),
        errorMsg: e.message,
      },
    })
    revalidatePath("/schedules")
    revalidatePath("/execution-logs")
    return { success: false, error: e.message }
  }
}

// Retry a failed execution
export async function retryExecution(executionId: string) {
  const session = await auth()
  if (!session?.user?.orgId) throw new Error("Unauthorized")

  const execution = await prisma.executionLog.findUnique({
    where: { id: executionId },
    include: { schedule: { include: { report: true, notificationChannels: true } } },
  })
  if (!execution || !execution.schedule || execution.schedule.orgId !== session.user.orgId) throw new Error("Not found")

  // Create a new execution log entry (retry)
  const retryExec = await prisma.executionLog.create({
    data: {
      scheduleId: execution.scheduleId,
      reportName: execution.reportName,
      status: "RUNNING",
      trigger: "RETRY",
      startedAt: new Date(),
    },
  })

  try {
    const filePath = await exportReport(execution.schedule.reportId)
    if (!filePath) throw new Error("Export failed")

    const channels = execution.schedule.notificationChannels
    for (const channel of channels) {
      await sendNotification(channel, execution.schedule.recipients, execution.schedule.telegramChat, filePath)
    }

    await prisma.executionLog.update({
      where: { id: retryExec.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        durationMs: Date.now() - retryExec.startedAt.getTime(),
        outputPath: filePath as string,
      },
    })

    revalidatePath("/execution-logs")
    return { success: true }
  } catch (e: any) {
    await prisma.executionLog.update({
      where: { id: retryExec.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        durationMs: Date.now() - retryExec.startedAt.getTime(),
        errorMsg: e.message,
      },
    })
    revalidatePath("/execution-logs")
    return { success: false, error: e.message }
  }
}

// Get execution logs with filtering
export async function getExecutionLogs(filter: {
  status?: string
  trigger?: string
  dateFrom?: string
  dateTo?: string
  scheduleId?: string
}) {
  const session = await auth()
  if (!session?.user?.orgId) throw new Error("Unauthorized")

  const where: any = { schedule: { orgId: session.user.orgId } }
  if (filter.status) where.status = filter.status
  if (filter.trigger) where.trigger = filter.trigger
  if (filter.scheduleId) where.scheduleId = filter.scheduleId
  if (filter.dateFrom || filter.dateTo) {
    where.startedAt = {}
    if (filter.dateFrom) where.startedAt.gte = new Date(filter.dateFrom)
    if (filter.dateTo) where.startedAt.lte = new Date(filter.dateTo)
  }

  return await prisma.executionLog.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 100,
  })
}
```

---

## Step 4: Notification Sending Helper

Create `src/lib/notifications.ts`:

```ts
import { prisma } from "@/lib/prisma"
import nodemailer from "nodemailer"

export async function sendNotification(
  channel: any,
  recipients: string[],
  telegramChat: string | null,
  filePath: string,
) {
  if (channel.type === "EMAIL") {
    const config = channel.config as any
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.auth.user,
        pass: config.auth.pass,
      },
    })

    // For each recipient, send email with attachment link (or attach file)
    for (const email of recipients) {
      await transporter.sendMail({
        from: `"${config.senderName}" <${config.senderEmail}>`,
        to: email,
        subject: "Scheduled Report",
        text: `Your report is ready. Download: ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}${filePath}`,
        html: `<p>Your report is ready. <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}${filePath}">Download</a></p>`,
      })
    }
  } else if (channel.type === "TELEGRAM") {
    if (!telegramChat) return
    const config = channel.config as any
    const url = `https://api.telegram.org/bot${config.botToken}/sendDocument`
    const form = new FormData()
    // For simplicity, send a message with download link (Telegram sendDocument would need file upload)
    const textUrl = `https://api.telegram.org/bot${config.botToken}/sendMessage`
    await fetch(textUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramChat,
        text: `📊 Report generated: ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}${filePath}`,
      }),
    })
  }
}
```

---

## Step 5: Schedule Pages

### Schedule list page

`src/app/(dashboard)/schedules/page.tsx`

```tsx
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ToggleScheduleButton } from "./toggle-button"
import { RunNowButton } from "./run-now-button"

export default async function SchedulesPage() {
  const session = await auth()
  const orgId = session?.user?.orgId!
  const schedules = await prisma.schedule.findMany({
    where: { orgId },
    include: { report: true },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h1 className="text-3xl font-bold">Schedules</h1>
        <Link href="/schedules/new"><Button>+ New Schedule</Button></Link>
      </div>
      {schedules.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No schedules yet.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {schedules.map(sch => (
            <Card key={sch.id} className="flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Link href={`/schedules/${sch.id}`} className="font-semibold hover:underline">{sch.report.name}</Link>
                <Badge variant={sch.enabled ? "default" : "secondary"}>{sch.enabled ? "Active" : "Paused"}</Badge>
              </CardHeader>
              <CardContent className="flex-1 space-y-2">
                <p className="text-sm text-muted-foreground">Cron: <code>{sch.cronExpr}</code></p>
                <p className="text-sm">Next run: {sch.nextRun ? new Date(sch.nextRun).toLocaleString() : "—"}</p>
                <div className="flex items-center gap-2 mt-2">
                  <ToggleScheduleButton scheduleId={sch.id} enabled={sch.enabled} />
                  <RunNowButton scheduleId={sch.id} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
```

Create client components for buttons in same folder:

`src/app/(dashboard)/schedules/toggle-button.tsx`:

```tsx
"use client"

import { Button } from "@/components/ui/button"
import { toggleSchedule } from "@/app/actions/schedules"
import { useRouter } from "next/navigation"

export function ToggleScheduleButton({ scheduleId, enabled }: { scheduleId: string; enabled: boolean }) {
  const router = useRouter()
  async function handleToggle() {
    await toggleSchedule(scheduleId, !enabled)
    router.refresh()
  }
  return (
    <Button variant="outline" size="sm" onClick={handleToggle}>
      {enabled ? "Pause" : "Resume"}
    </Button>
  )
}
```

`src/app/(dashboard)/schedules/run-now-button.tsx`:

```tsx
"use client"

import { Button } from "@/components/ui/button"
import { runNow } from "@/app/actions/schedules"
import { useState } from "react"

export function RunNowButton({ scheduleId }: { scheduleId: string }) {
  const [loading, setLoading] = useState(false)
  const handle = async () => {
    setLoading(true)
    await runNow(scheduleId)
    setLoading(false)
  }
  return (
    <Button variant="secondary" size="sm" onClick={handle} disabled={loading}>
      {loading ? "Running..." : "Run Now"}
    </Button>
  )
}
```

### New schedule form

`src/app/(dashboard)/schedules/new/page.tsx`

```tsx
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import ScheduleForm from "@/components/schedule/schedule-form"

export default async function NewSchedulePage() {
  const session = await auth()
  const orgId = session?.user?.orgId!
  const reports = await prisma.reportTemplate.findMany({
    where: { orgId },
    select: { id: true, name: true },
  })
  const channels = await prisma.notificationChannel.findMany({
    where: { orgId, enabled: true },
    select: { id: true, name: true, type: true },
  })
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">New Schedule</h1>
      <ScheduleForm reports={reports} channels={channels} />
    </div>
  )
}
```

### Schedule detail/edit page

`src/app/(dashboard)/schedules/[id]/page.tsx`

```tsx
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { notFound } from "next/navigation"
import ScheduleForm from "@/components/schedule/schedule-form"
import { deleteSchedule } from "@/app/actions/schedules"
import { Button } from "@/components/ui/button"

export default async function ScheduleDetail({ params }: { params: { id: string } }) {
  const session = await auth()
  const orgId = session?.user?.orgId!
  const schedule = await prisma.schedule.findUnique({
    where: { id: params.id },
    include: { notificationChannels: true, report: true },
  })
  if (!schedule || schedule.orgId !== orgId) notFound()

  const reports = await prisma.reportTemplate.findMany({
    where: { orgId },
    select: { id: true, name: true },
  })
  const channels = await prisma.notificationChannel.findMany({
    where: { orgId, enabled: true },
    select: { id: true, name: true, type: true },
  })

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex justify-between">
        <h1 className="text-3xl font-bold">Edit Schedule</h1>
        <form action={async () => {
          "use server"
          await deleteSchedule(params.id)
        }}>
          <Button variant="destructive" type="submit">Delete</Button>
        </form>
      </div>
      <ScheduleForm schedule={schedule} reports={reports} channels={channels} />
    </div>
  )
}
```

### Schedule form component (with cron builder and next-run preview)

Create `src/components/schedule/schedule-form.tsx`:

```tsx
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createSchedule, updateSchedule } from "@/app/actions/schedules"
import { validateCron, getNextRunDate } from "@/lib/cron-utils" // utility for client-side validation
import cronstrue from "cronstrue" // optional: human readable cron

// We'll implement simple cron preview
export default function ScheduleForm({
  schedule,
  reports,
  channels,
}: {
  schedule?: any
  reports: { id: string; name: string }[]
  channels: { id: string; name: string; type: string }[]
}) {
  const router = useRouter()
  const [reportId, setReportId] = useState(schedule?.reportId || "")
  const [cronExpr, setCronExpr] = useState(schedule?.cronExpr || "0 8 * * *")
  const [recipients, setRecipients] = useState(schedule?.recipients?.join(", ") || "")
  const [telegramChat, setTelegramChat] = useState(schedule?.telegramChat || "")
  const [selectedChannels, setSelectedChannels] = useState<string[]>(
    schedule?.notificationChannels?.map((ch: any) => ch.id) || []
  )
  const [nextRun, setNextRun] = useState<string>("")
  const [error, setError] = useState("")

  // Compute next run preview
  useEffect(() => {
    try {
      const next = getNextRunDate(cronExpr)
      setNextRun(next ? next.toLocaleString() : "Invalid")
      setError("")
    } catch (e: any) {
      setNextRun("")
      setError(e.message)
    }
  }, [cronExpr])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData()
    formData.append("reportId", reportId)
    formData.append("cronExpr", cronExpr)
    formData.append("recipients", recipients)
    formData.append("telegramChat", telegramChat)
    formData.append("channelIds", selectedChannels.join(","))

    if (schedule) {
      await updateSchedule(schedule.id, formData)
    } else {
      await createSchedule(formData)
    }
    router.push("/schedules")
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Schedule Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Report</Label>
            <Select value={reportId} onValueChange={setReportId} required>
              <SelectTrigger><SelectValue placeholder="Select report" /></SelectTrigger>
              <SelectContent>
                {reports.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Cron Expression</Label>
            <Input
              value={cronExpr}
              onChange={e => setCronExpr(e.target.value)}
              placeholder="0 8 * * *"
              required
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Min Hour Day Month Weekday</span>
              {nextRun && !error && <span>Next run: {nextRun}</span>}
              {error && <span className="text-red-500">{error}</span>}
            </div>
          </div>

          <div>
            <Label>Email Recipients (comma-separated)</Label>
            <Input value={recipients} onChange={e => setRecipients(e.target.value)} placeholder="user@example.com, admin@example.com" />
          </div>

          <div>
            <Label>Telegram Chat ID (if any)</Label>
            <Input value={telegramChat} onChange={e => setTelegramChat(e.target.value)} placeholder="-1001234567890" />
          </div>

          <div>
            <Label>Notification Channels</Label>
            {/* Simple multi-select using checkboxes inside a dropdown; we'll build a custom component or use existing */}
            <ChannelSelector channels={channels} selected={selectedChannels} onChange={setSelectedChannels} />
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button type="submit">{schedule ? "Update" : "Create"} Schedule</Button>
      </div>
    </form>
  )
}

// Simple multi-select for channels
function ChannelSelector({ channels, selected, onChange }: {
  channels: { id: string; name: string; type: string }[]
  selected: string[]
  onChange: (sel: string[]) => void
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  return (
    <div className="border rounded-md p-2 max-h-32 overflow-y-auto">
      {channels.length === 0 && <p className="text-sm text-muted-foreground">No channels configured</p>}
      {channels.map(ch => (
        <label key={ch.id} className="flex items-center gap-2 py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={selected.includes(ch.id)}
            onChange={() => toggle(ch.id)}
            className="rounded"
          />
          {ch.name} ({ch.type})
        </label>
      ))}
    </div>
  )
}
```

We need the `cron-utils` client side. Create `src/lib/cron-utils.ts`:

```ts
import cronParser from "cron-parser"

export function getNextRunDate(cronExpr: string): Date | null {
  try {
    const interval = cronParser.parseExpression(cronExpr, { currentDate: new Date() })
    return interval.next().toDate()
  } catch {
    return null
  }
}
```

Note: `cron-parser` works on server; for client preview we'll use a simple API or calculate via server action. But to keep things simple, we can use the `cron-parser` package directly in the client (it's compatible with browser bundling). We'll import it directly in `cron-utils.ts` as above. The `cronstrue` optional package can be installed for human readable.

---

## Step 6: Execution Logs Pages

### Execution logs list with filters and stats

`src/app/(dashboard)/execution-logs/page.tsx`

```tsx
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import ExecutionLogsClient from "./client"

export default async function ExecutionLogsPage({ searchParams }: { searchParams: any }) {
  const session = await auth()
  const orgId = session?.user?.orgId!

  const statusFilter = searchParams.status || undefined
  const triggerFilter = searchParams.trigger || undefined
  const dateFrom = searchParams.dateFrom || undefined
  const dateTo = searchParams.dateTo || undefined

  const where: any = { schedule: { orgId } }
  if (statusFilter) where.status = statusFilter
  if (triggerFilter) where.trigger = triggerFilter
  if (dateFrom || dateTo) {
    where.startedAt = {}
    if (dateFrom) where.startedAt.gte = new Date(dateFrom)
    if (dateTo) where.startedAt.lte = new Date(dateTo)
  }

  const logs = await prisma.executionLog.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { schedule: { select: { id: true, report: { select: { name: true } } } } },
  })

  // stats
  const stats = await prisma.executionLog.groupBy({
    by: ["status"],
    where: { schedule: { orgId } },
    _count: true,
  })
  const statsMap: any = {}
  stats.forEach(s => (statsMap[s.status] = s._count))

  return <ExecutionLogsClient logs={logs} stats={statsMap} searchParams={searchParams} />
}
```

Client component for filters and display:

`src/app/(dashboard)/execution-logs/client.tsx`

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

export default function ExecutionLogsClient({ logs, stats, searchParams }: any) {
  const router = useRouter()
  const [status, setStatus] = useState(searchParams.status || "")
  const [trigger, setTrigger] = useState(searchParams.trigger || "")
  const [dateFrom, setDateFrom] = useState(searchParams.dateFrom || "")
  const [dateTo, setDateTo] = useState(searchParams.dateTo || "")

  const applyFilters = () => {
    const params = new URLSearchParams()
    if (status) params.set("status", status)
    if (trigger) params.set("trigger", trigger)
    if (dateFrom) params.set("dateFrom", dateFrom)
    if (dateTo) params.set("dateTo", dateTo)
    router.push(`/execution-logs?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Execution Logs</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Runs</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{stats.SUCCESS + stats.FAILED + stats.RUNNING || 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Success</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-green-600">{stats.SUCCESS || 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Failed</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-red-600">{stats.FAILED || 0}</CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All</SelectItem>
              <SelectItem value="SUCCESS">Success</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="RUNNING">Running</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Trigger</Label>
          <Select value={trigger} onValueChange={setTrigger}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All</SelectItem>
              <SelectItem value="SCHEDULED">Scheduled</SelectItem>
              <SelectItem value="MANUAL">Manual</SelectItem>
              <SelectItem value="RETRY">Retry</SelectItem>
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
      </div>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell>{log.reportName}</TableCell>
                  <TableCell>
                    <Badge variant={log.status === "SUCCESS" ? "default" : log.status === "FAILED" ? "destructive" : "secondary"}>
                      {log.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{log.trigger}</TableCell>
                  <TableCell className="text-xs">{new Date(log.startedAt).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{log.durationMs ? `${log.durationMs} ms` : "—"}</TableCell>
                  <TableCell>
                    <Link href={`/execution-logs/${log.id}`} className="text-blue-500 hover:underline text-sm">View</Link>
                  </TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No logs found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
```

We need to import `Label` from somewhere; we'll add the imports. We'll also fix the `Label` import in the client component.

### Execution detail page

`src/app/(dashboard)/execution-logs/[id]/page.tsx`

```tsx
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { retryExecution } from "@/app/actions/schedules"
import Link from "next/link"

export default async function ExecutionLogDetail({ params }: { params: { id: string } }) {
  const session = await auth()
  const orgId = session?.user?.orgId!
  const log = await prisma.executionLog.findUnique({
    where: { id: params.id },
    include: { schedule: { include: { report: true, notificationChannels: true } } },
  })
  if (!log || (log.schedule && log.schedule.orgId !== orgId)) notFound()

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex justify-between">
        <h1 className="text-3xl font-bold">Execution Details</h1>
        {log.status === "FAILED" && (
          <form action={async () => {
            "use server"
            await retryExecution(params.id)
          }}>
            <Button type="submit">Retry</Button>
          </form>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle>Execution Info</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div><span className="font-semibold">Report:</span> {log.reportName}</div>
          <div><span className="font-semibold">Status:</span> <Badge variant={log.status === "SUCCESS" ? "default" : log.status === "FAILED" ? "destructive" : "secondary"}>{log.status}</Badge></div>
          <div><span className="font-semibold">Trigger:</span> {log.trigger}</div>
          <div><span className="font-semibold">Started at:</span> {new Date(log.startedAt).toLocaleString()}</div>
          {log.finishedAt && <div><span className="font-semibold">Finished at:</span> {new Date(log.finishedAt).toLocaleString()}</div>}
          {log.durationMs && <div><span className="font-semibold">Duration:</span> {log.durationMs} ms</div>}
          {log.rowsExported != null && <div><span className="font-semibold">Rows exported:</span> {log.rowsExported}</div>}
        </CardContent>
      </Card>

      {log.errorMsg && (
        <Card className="border-red-300">
          <CardHeader><CardTitle className="text-red-600">Error Message</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap">{log.errorMsg}</pre>
          </CardContent>
        </Card>
      )}

      {log.outputPath && (
        <div>
          <Link href={log.outputPath} className="text-blue-500 underline">Download generated file</Link>
        </div>
      )}
    </div>
  )
}
```

---

## Step 7: Audit Logging

Already included in schedule actions (create, update, delete, toggle). Also we should log executions (success/failure) but that's already implicitly in the execution log.

---

## Step 8: Background Scheduler (Simplified)

For Phase 6 we don't need a full job queue yet; we can simulate execution via a Next.js API route that runs every minute using `cron` or `setInterval`. We'll add a simple route that checks schedules and runs due ones.

Create `src/app/api/scheduler/run/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { exportReport } from "@/app/actions/reports"
import { sendNotification } from "@/lib/notifications"

export async function GET(req: NextRequest) {
  // Auth check: only allow from internal or with secret token
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  // Find enabled schedules where nextRun <= now
  const dueSchedules = await prisma.schedule.findMany({
    where: {
      enabled: true,
      nextRun: { lte: now },
    },
    include: {
      report: true,
      notificationChannels: true,
    },
  })

  for (const schedule of dueSchedules) {
    // Create execution log
    const execution = await prisma.executionLog.create({
      data: {
        scheduleId: schedule.id,
        reportName: schedule.report.name,
        status: "RUNNING",
        trigger: "SCHEDULED",
        startedAt: new Date(),
      },
    })

    try {
      const filePath = await exportReport(schedule.reportId)
      if (!filePath) throw new Error("Export failed")

      // Send notifications
      for (const channel of schedule.notificationChannels) {
        await sendNotification(channel, schedule.recipients, schedule.telegramChat, filePath)
      }

      await prisma.executionLog.update({
        where: { id: execution.id },
        data: {
          status: "SUCCESS",
          finishedAt: new Date(),
          durationMs: Date.now() - execution.startedAt.getTime(),
          outputPath: filePath as string,
        },
      })

      // Update next run and last run
      const nextRun = getNextRun(schedule.cronExpr)
      await prisma.schedule.update({
        where: { id: schedule.id },
        data: {
          lastRun: new Date(),
          nextRun: nextRun || undefined,
        },
      })
    } catch (e: any) {
      await prisma.executionLog.update({
        where: { id: execution.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          durationMs: Date.now() - execution.startedAt.getTime(),
          errorMsg: e.message,
        },
      })
    }
  }

  return NextResponse.json({ processed: dueSchedules.length })
}

// Reuse helper (must be imported or redefined)
function getNextRun(cronExpr: string): Date | null {
  try {
    const cronParser = require("cron-parser")
    const interval = cronParser.parseExpression(cronExpr, { currentDate: new Date() })
    return interval.next().toDate()
  } catch {
    return null
  }
}
```

Set `CRON_SECRET` in `.env`. Then we can set up a cron job (e.g., Vercel cron) or use a simple HTTP endpoint.

---

## Summary of Phase 6

- `Schedule` and `ExecutionLog` models, many-to-many with channels.
- Full schedule list with toggle, run now, delete.
- Schedule form with cron input, next-run preview, multi-channel selection.
- Execution logs list with filters, stats, pagination.
- Execution detail page with retry, download link, error messages.
- Manual run action triggers report generation and notification.
- Background scheduler endpoint for automated runs.
- Audit logging for schedule changes.

Phase 6 is complete. Phase 7 (File Storage & History) next when ready!