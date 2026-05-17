"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createSchedule, updateSchedule } from "@/app/actions/schedules"
import { getNextRunDate, formatNextRun } from "@/lib/cron-utils"

interface ScheduleFormProps {
  orgId: string
  initialData?: {
    id: string
    name: string
    cronExpr: string
    reportId?: string
    recipients: string[]
    retryCount: number
    enabled: boolean
  }
  reports?: { id: string; title: string }[]
  onSuccess?: (id: string) => void
}

export function ScheduleForm({ orgId, initialData, reports = [], onSuccess }: ScheduleFormProps) {
  const [loading, setLoading] = useState(false)
  const [nextRun, setNextRun] = useState<string>("")
  const [error, setError] = useState("")
  const [formData, setFormData] = useState({
    name: initialData?.name ?? "",
    cronExpr: initialData?.cronExpr ?? "0 9 * * 1",
    reportId: initialData?.reportId ?? "",
    recipientInput: "",
    recipients: initialData?.recipients ?? [] as string[],
    retryCount: initialData?.retryCount ?? 3,
  })

  useEffect(() => {
    if (formData.cronExpr) {
      try {
        const next = getNextRunDate(formData.cronExpr)
        setNextRun(formatNextRun(next))
        setError("")
      } catch {
        setError("Invalid cron expression")
        setNextRun("")
      }
    }
  }, [formData.cronExpr])

  const addRecipient = () => {
    if (formData.recipientInput && !formData.recipients.includes(formData.recipientInput)) {
      setFormData(prev => ({ ...prev, recipients: [...prev.recipients, prev.recipientInput], recipientInput: "" }))
    }
  }

  const removeRecipient = (email: string) => {
    setFormData(prev => ({ ...prev, recipients: prev.recipients.filter(r => r !== email) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const result = initialData?.id
        ? await updateSchedule({
            ...formData,
            id: initialData.id,
            cronExpr: formData.cronExpr,
            recipients: formData.recipients,
            retryCount: formData.retryCount,
            reportId: formData.reportId || undefined,
          })
        : await createSchedule({
            name: formData.name,
            cronExpr: formData.cronExpr,
            recipients: formData.recipients,
            retryCount: formData.retryCount,
            reportId: formData.reportId || undefined,
          })

      if (result.success && "id" in result && typeof (result as any).id === "string") {
        onSuccess?.((result as any).id)
      } else {
        setError(result.error || "Failed to save schedule")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <div>
        <Label htmlFor="name">Schedule Name</Label>
        <Input id="name" name="name" value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="Weekly Sales Report" required />
      </div>

      <div>
        <Label htmlFor="cronExpr">Cron Expression</Label>
        <Input id="cronExpr" name="cronExpr" value={formData.cronExpr} onChange={e => setFormData(prev => ({ ...prev, cronExpr: e.target.value }))} placeholder="0 9 * * 1" required />
        {error ? (
          <p className="text-red-500 text-xs mt-1">{error}</p>
        ) : nextRun ? (
          <p className="text-emerald-600 text-xs mt-1">Next run: {nextRun}</p>
        ) : (
          <p className="text-muted-foreground text-xs mt-1">Format: min hour day month weekday (UTC)</p>
        )}
      </div>

      <div>
        <Label htmlFor="reportId">Report</Label>
        <Select
          id="reportId"
          name="reportId"
          value={formData.reportId as string}
          onValueChange={(val) => setFormData(prev => ({ ...prev, reportId: val ?? "" }))}
        >
          <option value="">— No report attached —</option>
          {reports.map(r => (
            <option key={r.id} value={r.id}>{r.title}</option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="recipient">Recipients (Emails)</Label>
        <div className="flex gap-2">
          <Input
            id="recipient"
            name="recipient"
            type="email"
            value={formData.recipientInput}
            onChange={e => setFormData(prev => ({ ...prev, recipientInput: e.target.value }))}
            placeholder="user@company.com"
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addRecipient() } }}
          />
          <Button type="button" variant="outline" onClick={addRecipient}>Add</Button>
        </div>
        {formData.recipients.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {formData.recipients.map(email => (
              <span key={email} className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs">
                {email}
                <button type="button" onClick={() => removeRecipient(email)} className="text-red-500 hover:text-red-700 ml-1">&times;</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="retryCount">Max Retries (0–10)</Label>
        <Input id="retryCount" name="retryCount" type="number" min={0} max={10} value={formData.retryCount} onChange={e => setFormData(prev => ({ ...prev, retryCount: parseInt(e.target.value) || 0 }))} />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={loading || !!error}>
          {loading ? "Saving..." : initialData?.id ? "Update Schedule" : "Create Schedule"}
        </Button>
      </div>
    </form>
  )
}
