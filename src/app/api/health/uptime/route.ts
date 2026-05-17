import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    // ── DB uptime & pool ──
    const start = Date.now()
    await prisma.$queryRaw`SELECT 1`
    const dbLatencyMs = Date.now() - start
    const dbUp = dbLatencyMs < 5000

    // ── Schedule stats ──
    const [totalSchedules, enabledSchedules, overdueSchedules] = await Promise.all([
      prisma.schedule.count(),
      prisma.schedule.count({ where: { enabled: true } }),
      prisma.schedule.count({
        where: { enabled: true, nextRunAt: { lt: new Date() } },
      }),
    ])

    // ── Execution stats (last 24h) ──
    const oneDayAgo = new Date(Date.now() - 86400_000)
    const [executions24h, failed24h] = await Promise.all([
      prisma.executionLog.count({ where: { createdAt: { gte: oneDayAgo } } }),
      prisma.executionLog.count({ where: { createdAt: { gte: oneDayAgo }, status: "FAILED" } }),
    ])

    // ── Execution breakdown last 7 days ──
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000)
    const executionsByDay = await prisma.executionLog.groupBy({
      by: ["status", "trigger"],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: true,
    })

    const uptime = process.uptime()
    const memUsage = process.memoryUsage()
    const nodeVersion = process.version

    return NextResponse.json({
      uptime: {
        seconds: Math.floor(uptime),
        human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      },
      database: { connected: dbUp, latencyMs: dbLatencyMs },
      node: { version: nodeVersion, rssMB: Math.round(memUsage.rss / 1024 / 1024) },
      schedules: { total: totalSchedules, enabled: enabledSchedules, overdue: overdueSchedules },
      executions: { last24h: executions24h, failed24h },
      executionsByDay: executionsByDay,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Health check error:", error)
    return NextResponse.json({ status: "error", message: "Health check failed" }, { status: 503 })
  }
}
