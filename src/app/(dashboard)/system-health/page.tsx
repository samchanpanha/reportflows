"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SystemHealthSkeleton } from "./client-skeleton"

interface HealthResponse {
  uptime: { seconds: number; human: string }
  database: { connected: boolean; latencyMs: number }
  node: { version: string; rssMB: number }
  schedules: { total: number; enabled: number; overdue: number }
  executions: { last24h: number; failed24h: number }
  executionsByDay: Array<{ status: string; trigger: string; _count: number }>
  timestamp: string
}

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    fetch("/api/health/uptime")
      .then(r => r.ok ? r.json() : Promise.reject(new Error("Failed to load")))
      .then((d: HealthResponse) => { if (!cancelled) setData(d) })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) return <SystemHealthSkeleton />
  if (error) return <div className="text-red-600">{error}</div>
  if (!data) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">System Health</h1>
        <p className="text-muted-foreground mt-1">
          Monitor uptime, database connection, and execution stats.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard title="Uptime" value={data.uptime.human} sub={`${data.uptime.seconds}s total`} />
        <MetricCard title="DB Connection" value={data.database.connected ? "Healthy" : "Down"} sub={`Latency: ${data.database.latencyMs}ms`} />
        <MetricCard title="Node Version" value={"v" + (data.node.version || "unknown")} sub={`RSS: ${data.node.rssMB} MB`} />
        <MetricCard title="Schedules" value={`${data.schedules.enabled} active`} sub={`${data.schedules.total} total, ${data.schedules.overdue} overdue`} />
        <MetricCard title="Executions (24h)" value={`${data.executions.last24h}`} sub={`${data.executions.failed24h} failed`} />
        <MetricCard title="Last Updated" value={new Date(data.timestamp).toLocaleTimeString()} sub="auto-refreshes on page load" />
      </div>

      {data.executionsByDay.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Executions by Status (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.executionsByDay.map((g, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {g.status} · {g.trigger}
                  </span>
                  <span className="font-medium">{g._count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function MetricCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {sub && (
        <CardContent className="text-xs text-muted-foreground pb-4">{sub}</CardContent>
      )}
    </Card>
  )
}
