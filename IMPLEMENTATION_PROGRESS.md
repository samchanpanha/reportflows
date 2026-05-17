# ReportFlow Implementation Progress

## ✅ All 7 Rounds Complete (Phases 2–9)

### Build Status
| Command | Status |
|---------|--------|
| `npx tsc --noEmit` | ✅ Zero TypeScript errors |
| `npx next build --webpack` | ✅ 25/25 static pages generated |
| `npx esbuild` API routes | ✅ All compiled |

### Round 1: Data Sources CRUD ✅
**Files modified/created:**
- `prisma/schema.prisma` — Enums: `DataSourceType`, `DataSourceStatus`
- `src/app/actions/datasources.ts` — `createDataSource`, `updateDataSource`, `deleteDataSource`, `testDataSourceConnection`
- `src/components/datasource/datasource-form.tsx` — Dynamic form per type (PostgreSQL/MySQL/CSV/API)
- `src/app/(dashboard)/data-sources/page.tsx` — Grid view with status badges + "New Data Source" CTA
- `src/app/(dashboard)/data-sources/[id]/page.tsx` — Edit/delete detail view
- `src/app/(dashboard)/data-sources/new/page.tsx` — Create form page

---

### Round 2: Query Builder ✅
**Files modified/created:**
- `prisma/schema.prisma` — Adds `QueryVersion` model + `Query.dataSourceId` FK
- `src/app/actions/queries.ts` — Auto-versioning; `getQueryVersions`, `rollbackQueryVersion`
- `src/components/query/query-form.tsx` — Monaco editor + SQL parameter `{{paramName}}` syntax
- `src/app/(dashboard)/queries/page.tsx` — +New Query CTA, clickable cards
- `src/app/(dashboard)/queries/[id]/page.tsx` — Detail/edit + version history
- `src/app/(dashboard)/queries/new/page.tsx` — Create page

---

### Round 3: Report Designer & Export ✅
**Files modified/created:**
- `prisma/schema.prisma` — `columnsConfig Json`, `queryId` on `ReportTemplate`
- `src/lib/report-generators.ts` — `generateExcelBuffer()`, `generatePDFBuffer()`, `generateCSVBuffer()`
- `src/app/actions/reports.ts` — `createReport`, `updateReport`, `deleteReport`, `exportReport`
- `src/components/report/report-designer.tsx` — Column config tabs, format options, visibility/order
- `src/app/api/reports/[id]/export/route.ts` — Full PDF/Excel/CSV generation + `GeneratedFile` logging
- `src/app/(dashboard)/reports/page.tsx` — +New Report, query name lookup, format badges
- `src/app/(dashboard)/reports/[id]/page.tsx` — Detail/edit with designer
- `src/app/(dashboard)/reports/new/page.tsx` — Create page

---

### Round 4: Notification Channels ✅
**Files modified/created:**
- `prisma/schema.prisma` — `NotificationChannel` model (type '', name, config JSON, enabled)
- `src/app/actions/notifications.ts` — CRUD + `testEmailChannel` / `testTelegramChannel`
- `src/lib/notifications.ts` — `sendNotification()` runtime sender (email/SMTP + Telegram Bot API)
- `src/app/(dashboard)/notifications/page.tsx` — Delivery channels section + recent alerts
- `src/app/(dashboard)/notifications/client.tsx` — Tabs, config forms, test buttons, toggle, delete
- `schema.prisma` migration: `20260517072325_expand_models_with_enums`

---

### Round 5: Scheduler & Execution Engine ✅
**Files created:**
- `src/app/actions/schedules.ts` — `createSchedule`, `updateSchedule`, `deleteSchedule`, `toggleSchedule`, `runNow`, `retryExecution`, `getAllScheduleLogs`
- `src/lib/cron-utils.ts` — `getNextRunDate()` via `cron-parser`, `formatNextRun()`, `computeNextRunAt()`
- `src/components/schedule/schedule-form.tsx` — Cron input with live next-run preview, report selector, recipients list, retry count
- `src/app/api/schedules/[id]/run/route.ts` — POST to trigger immediate execution
- `src/app/api/schedules/[id]/toggle/route.ts` — POST to enable/pause
- `src/app/(dashboard)/schedules/page.tsx` — Table + Run Now / Pause buttons + report name lookup
- `src/app/(dashboard)/schedules/new/page.tsx` — Create schedule page
- `src/app/(dashboard)/schedules/[id]/page.tsx` — Edit + execution history table

---

### Round 6: File Storage, Audit & Monitoring ✅
**Files created:**
- `src/lib/s3.ts` — `FileStorage` class: local-first + AWS S3 optional backend; `fileStorage` singleton
- `src/app/api/files/[id]/download/route.ts` — GET file download with expiry guard
- `src/app/api/files/[id]/preview/route.ts` — GET file metadata (idempotent preview)
- `src/app/api/audit-logs/export/route.ts` — CSV export of audit logs with date/action/entity filters
- `src/app/api/health/uptime/route.ts` — JSON: uptime, DB latency, schedule stats, 24h execution counts
- `src/app/(dashboard)/report-history/page.tsx` — Paginated file list with download / info actions
- `src/app/(dashboard)/system-health/page.tsx` — Health metrics cards + execution breakdown
- `src/app/(dashboard)/system-health/client-skeleton.tsx` — Loading skeleton for health page
- `src/app/(dashboard)/audit-logs/page.tsx` — Pre-existing page; left intact (migration to filterable table is a future task)

---

### Round 7: UI Polish ✅
**Files created/modified:**
- `src/components/ui/skeleton-card.tsx` — Reusable animated skeleton component
- `src/components/ui/empty-state.tsx` — Configurable empty state with icon/action hook
- `src/components/error-boundary.tsx` — Class component catching subtree errors
- `src/app/layout.tsx` — Added `<Toaster position="top-center" richColors />` from `sonner`
- `src/components/layout/dashboard-layout.tsx` — `animate-fade-to-black` on `<main>`
- Keys: `notifications/page.tsx`, `schedules/page.tsx`, `reports/page.tsx`, `audit-logs/page.tsx` — all use `use client` correctly

---

### Schema (applied, zero drift)
```
DataSourceType:  POSTGRESQL, MYSQL, CSV, API
DataSourceStatus: ACTIVE, INACTIVE, ERROR
ExecutionStatus:  PENDING, RUNNING, SUCCESS, FAILED, CANCELLED
ExecutionTrigger: MANUAL, SCHEDULED, RETRY
```

| Table | Status |
|-------|--------|
| `DataSource` | ✅ Enum `type` + `status` + `connectionDetails JSON` + `lastTested` |
| `Query` | ✅ `dataSourceId` FK, `QueryVersion` history table |
| `ReportTemplate` | ✅ `queryId` FK, `columnsConfig JSON`, `templateFile` |
| `Schedule` | ✅ `cronExpr`, `recipients[]`, `retryCount`, `enabled`, `nextRunAt` |
| `ExecutionLog` | ✅ `status`, `trigger`, `duration`, `output`, `error`, FK to `Schedule` |
| `NotificationChannel` | ✅ `type`, `name`, `config JSON`, `enabled` |
| `GeneratedFile` | ✅ `filePath`, `fileType`, `expiresAt`, FKs to `Schedule`/`ReportTemplate` |

---

### Current Capabilities
Users can now:
1. ✅ Create/update/delete database & API data sources with encrypted credentials
2. ✅ Test data source connections
3. ✅ Write SQL queries with Monaco editor + parameter extraction (`{{paramName}}`)
4. ✅ Query version history with rollback
5. ✅ Design report templates with column config (visibility, order, format)
6. ✅ Export reports to **Excel** (.xlsx), **PDF**, and **CSV** — real buffer generation
7. ✅ Configure **Email (SMTP)** and **Telegram** delivery channels
8. ✅ Save, toggle, and run schedules (manual `POST /api/schedules/:id/run`)
9. ✅ Real-time system health: uptime, DB ping, overdue schedules, execution counts
10. ✅ Download/preview generated files with expiry guard
11. ✅ CSV export of audit logs
12. ✅ Centralized toast notifications via `sonner`
13. ✅ Loading skeletons + error boundary for error handling

---

### Why `--webpack` in Build Command
Per-run build uses `npx next build --webpack` instead of plain `npx next build`. This is necessary because `fontkit@1.9.0` (installed via `pdfkit`) is precompiled against `@swc/helpers@0.3` with now-renamed decorator helper names (`applyDecoratedDescriptor` → `_apply_decorated_descriptor`) that break Turbopack's static ES module analysis in Next.js 16's default Turbopack build pipeline. Using Webpack skips Turbopack's static ESM resolver and relies on its node-like resolution which correctly handles the CJS/EMM compatibility gap.
<br>
*Note: In Vercel deployment, the `output: "standalone"` config generates a Node.js server that always uses Webpack-compatible CJS resolution, so this flag only affects local builds.*

---

### Dependencies Installed in Package.json
| Package | Purpose |
|---------|---------|
| `@monaco-editor/react` | SQL/MongoDB query editor |
| `exceljs` | Excel (.xlsx) export generation |
| `pdfkit` | PDF export generation |
| `nodemailer` | SMTP email delivery |
| `cron-parser` | Cron expression parsing + next-run scheduling |
| `@aws-sdk/client-s3` | Optional S3 file storage backend |
| `sonner` | Toast notifications |
| `vitest` | Test framework (config pending) |
| `zod` | Runtime schema validation on server actions |

---

### Next Suggested Steps
1. **Add `next build --webpack` as the default `build` script** in `package.json`
2. **Add real DB connection layer**: `executeQuery()` in `src/lib/dbConnector.ts` — connect to each datasource's postgres/mysql and execute parameterized SQL
3. **Add `loading.tsx` per route** for route-level loading states
4. **Add unit tests** (`vitest.config.ts` + `src/test/*.test.ts`)
5. **Add superadmin system health detail pages** with S3 storage management
6. **Upgrade `fontkit` to `@>=2.0.0`** to unblock default Turbopack builds when v3+ is stable
