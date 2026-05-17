import { PrismaClient } from "@prisma/client"
import type { Role } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  // ── Guard: skip if data already exists ────────────────────────────
  const existing = await prisma.user.findUnique({ where: { email: "admin@acme.com" } })
  if (existing) {
    console.log("✅ Seed data already exists, skipping.")
    return
  }

  // ══════════════════════════════════════════════════════════════════
  // ORG 1 — Acme Corp   (SUPERADMIN  admin@acme.com  / admin123)
  // ══════════════════════════════════════════════════════════════════
  const org1 = await prisma.organization.create({
    data: { name: "Acme Corp", plan: "ENTERPRISE" },
  })
  const org1AdminPw = await bcrypt.hash("admin123", 10)
  await prisma.user.create({
    data: { email: "admin@acme.com", passwordHash: org1AdminPw, role: "SUPERADMIN" as Role, orgId: org1.id },
  })

  // ── Data Source: internal analytics Postgres ──────────────────────
  const dsPg = await prisma.dataSource.create({
    data: {
      orgId: org1.id, name: "Acme Analytics DB", type: "POSTGRESQL",
      connectionDetails: { host: "db.acme.internal", port: 5432, database: "analytics", username: "acme_reader" },
      status: "ACTIVE",
    },
  })

  // ── Data Source: customer-facing MySQL ───────────────────────────
  const dsMySQL = await prisma.dataSource.create({
    data: {
      orgId: org1.id, name: "Acme Customer MySQL", type: "MYSQL",
      connectionDetails: { host: "mysql.acme.internal", port: 3306, database: "customers", username: "acme_readonly" },
      status: "ACTIVE",
    },
  })

  // ── Query 1: Monthly sales from Postgres ─────────────────────────
  const q1 = await prisma.query.create({
    data: {
      orgId: org1.id, dataSourceId: dsPg.id,
      name: "Monthly Sales Summary", description: "Total revenue grouped by month",
      sqlText: `SELECT DATE_TRUNC('month', created_at) AS month,\n       SUM(amount)        AS total_revenue,\n       COUNT(*)           AS orders,\n       AVG(amount)        AS avg_order\nFROM   orders\nWHERE  created_at >= {{startDate}}\n  AND  created_at <  {{endDate}}\nGROUP  BY 1\nORDER  BY 1;`,
      parameters: { startDate: { type: "string", label: "Start Date (YYYY-MM-DD)" }, endDate: { type: "string", label: "End Date (YYYY-MM-DD)" } },
    },
  })

  // ── Query 2: Top customers from MySQL ────────────────────────────
  const q2 = await prisma.query.create({
    data: {
      orgId: org1.id, dataSourceId: dsMySQL.id,
      name: "Top 10 Customers", description: "Highest-spending customers this year",
      sqlText: "SELECT c.name                        AS customer,\n       c.email                       AS email,\n       SUM(o.amount)                 AS total_spent,\n       COUNT(o.id)                   AS orders\nFROM   customers c\nJOIN   orders o ON o.customer_id = c.id\nWHERE  YEAR(o.created_at) = {{year}}\nGROUP  BY c.id\nORDER  BY total_spent DESC\nLIMIT   10;",
      parameters: { year: { type: "number", label: "Year (e.g. 2026)" } },
    },
  })

  // ── Query 3: Active subscriptions from Postgres ──────────────────
  const q3 = await prisma.query.create({
    data: {
      orgId: org1.id, dataSourceId: dsPg.id,
      name: "Active Subscriptions", description: "Current active paid subscriptions",
      sqlText: `SELECT plan_type                      AS subscription,\n       COUNT(*)                       AS active_users,\n       SUM(amount)                    AS mrr\nFROM   subscriptions\nWHERE  status = 'active'\nGROUP  BY plan_type\nORDER  BY mrr DESC;`,
    },
  })

  // ── Report 1: Monthly Sales (Excel) attached to q1 ──────────────
  await prisma.reportTemplate.create({
    data: {
      orgId: org1.id, queryId: q1.id,
      title: "Monthly Sales Report",
      description: "Executive monthly breakdown of revenue, orders, and average order value",
      format: "EXCEL",
      columnsConfig: {
        month:        { visible: true, order: 1,  format: "date",    options: { dateFormat: "yyyy-MM" } },
        total_revenue:{ visible: true, order: 2,  format: "currency", options: { currencySymbol: "$" } },
        orders:       { visible: true, order: 3,  format: "number",  options: { decimals: 0 } },
        avg_order:    { visible: true, order: 4,  format: "currency", options: { currencySymbol: "$" } },
      },
    },
  })

  // ── Report 2: Top Customers PDF ─────────────────────────────────
  await prisma.reportTemplate.create({
    data: {
      orgId: org1.id, queryId: q2.id,
      title: "Top Customers PDF",
      description: "Top-spending customers for executive review",
      format: "PDF",
      columnsConfig: {
        customer:      { visible: true, order: 1, format: "text" },
        email:         { visible: true, order: 2, format: "text" },
        total_spent:   { visible: true, order: 3, format: "currency", options: { currencySymbol: "$" } },
        orders:        { visible: true, order: 4, format: "number",  options: { decimals: 0 } },
      },
    },
  })

  // ── Report 3: Subscriptions CSV (no query — inline columnsConfig) ─
  await prisma.reportTemplate.create({
    data: {
      orgId: org1.id,
      title: "Subscription Revenue CSV",
      description: "Monthly recurring revenue breakdown by plan for finance upload",
      format: "CSV",
      columnsConfig: {
        subscription: { visible: true, order: 1, format: "text" },
        mrr:          { visible: true, order: 2, format: "currency", options: { currencySymbol: "$" } },
        active_users: { visible: true, order: 3, format: "number",   options: { decimals: 0 } },
      },
    },
  })

  // ── Schedule 1: Daily Sales → 09:00 UTC ──────────────────────────
  await prisma.schedule.create({
    data: {
      orgId: org1.id, reportId: (await prisma.reportTemplate.findFirst({ where: { orgId: org1.id, title: "Monthly Sales Report" } }))!.id,
      name: "Daily Sales Brief", cronExpr: "0 9 * * *", recipients: ["admin@acme.com"], retryCount: 2, enabled: true,
    },
  })

  // ┕═════════════════════════════════════════════════════════════════
  // ORG 2 — Beta Labs   (ORG_ADMIN  dev@betalabs.io  / devpass123)
  // ╕═════════════════════════════════════════════════════════════════
  const org2 = await prisma.organization.create({
    data: { name: "Beta Labs", plan: "BUSINESS" },
  })
  const org2AdminPw = await bcrypt.hash("devpass123", 10)
  await prisma.user.create({
    data: { email: "dev@betalabs.io", passwordHash: org2AdminPw, role: "ORG_ADMIN" as Role, orgId: org2.id },
  })

  // ── Data Source: Beta Postgres ────────────────────────────────────
  const ds2Pg = await prisma.dataSource.create({
    data: {
      orgId: org2.id, name: "Beta Analytics Postgres", type: "POSTGRESQL",
      connectionDetails: { host: "analytics.betalabs.dev", port: 5432, database: "events", username: "beta_read" },
      status: "ACTIVE",
    },
  })

  // ── Dummy query 1 ────────────────────────────────────────────────
  const bq1 = await prisma.query.create({
    data: {
      orgId: org2.id, dataSourceId: ds2Pg.id,
      name: "Daily Event Counts",
      sqlText: `SELECT date_trunc('day', occurred_at) AS day,\n       event_type,\n       COUNT(*)              AS count\nFROM   events\nWHERE  occurred_at >= {{fromDate}}\nGROUP  BY 1, 2\nORDER  BY 1;`,
      parameters: { fromDate: { type: "string", label: "From Date (YYYY-MM-DD)" } },
    },
  })

  // ── Report: Daily Events CSV ─────────────────────────────────────
  await prisma.reportTemplate.create({
    data: {
      orgId: org2.id, queryId: bq1.id,
      title: "Daily Event Report", description: "Event volume by type — CSV attachment for Slack",
      format: "CSV",
      columnsConfig: {
        day:        { visible: true, order: 1,  format: "date",    options: { dateFormat: "yyyy-MM-dd" } },
        event_type: { visible: true, order: 2,  format: "text" },
        count:      { visible: true, order: 3,  format: "number",  options: { decimals: 0 } },
      },
    },
  })

  // ── Schedule: Morning Events Brief ───────────────────────────────
  await prisma.schedule.create({
    data: {
      orgId: org2.id, reportId: (await prisma.reportTemplate.findFirst({ where: { orgId: org2.id, title: "Daily Event Report" } }))!.id,
      name: "Morning Events Brief", cronExpr: "0 8 * * *", recipients: ["dev@betalabs.io"], retryCount: 3, enabled: true,
    },
  })

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  const totalOrgs     = await prisma.organization.count()
  const totalUsers    = await prisma.user.count()
  const totalDs       = await prisma.dataSource.count()
  const totalQueries  = await prisma.query.count()
  const totalReports  = await prisma.reportTemplate.count()
  const totalScheds   = await prisma.schedule.count()

  console.log("\n✅ Seed complete!")
  console.log("  Orgs created:    ", totalOrgs)
  console.log("  Users created:   ", totalUsers)
  console.log("  Data sources:    ", totalDs)
  console.log("  Queries:         ", totalQueries)
  console.log("  Report templates:", totalReports)
  console.log("  Schedules:       ", totalScheds)
  console.log("\n  ── Default Accounts ─────────────────────────")
  console.log("  Org 1 — Acme Corp")
  console.log("     admin@acme.com   / admin123   (SUPERADMIN)")
  console.log("  Org 2 — Beta Labs  (new org — no UI page, seed only)")
  console.log("     dev@betalabs.io  / devpass123  (ORG_ADMIN)")
}

main()
  .catch((e: unknown) => console.error("Seed failed:", e))
  .finally(() => prisma.$disconnect())
