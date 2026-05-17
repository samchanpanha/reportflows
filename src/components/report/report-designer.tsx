"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createReport, updateReport, exportReport } from "@/app/actions/reports"
import { toast } from "sonner"
import type { Prisma } from "@prisma/client"

// ─── Preset Template Definitions ──────────────────────────────────────
// Each preset auto-detects selectable column patterns from the chosen query
// and applies a common reporting layout in one click.

interface ColumnPreset {
  key: string
  visible: boolean
  order: number
  format: Exclude<Column["format"], undefined>
  options?: Column["options"]
}

interface TemplatePreset {
  label: string
  description: string
  applies: (cols: Array<{ key: string }>) => boolean
  build: (cols: Array<{ key: string }>) => ColumnPreset[]
}

const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    label: "Finance Grid",
    description: "Revenue/cost columns with currency format",
    applies: (cols) => cols.some(c => /(revenue|amount|price|cost|expense|margin|profit|total)/i.test(c.key)),
    build: (cols) =>
      cols
        .filter(c => /(revenue|amount|price|cost|expense|margin|profit|total)/i.test(c.key))
        .slice(0, 6)
        .map((c, i) => ({ key: c.key, visible: true, order: i, format: "currency" as const, options: { currencySymbol: "$" } })),
  },
  {
    label: "Sales Summary",
    description: "Order count, revenue, quantity",
    applies: (cols) => cols.some(c => /(order|qty|quantity|sold|units|count)/i.test(c.key)),
    build: (cols) =>
      cols
        .filter(c => /(order|qty|quantity|sold|units|count)/i.test(c.key))
        .slice(0, 5)
        .map((c, i) => ({ key: c.key, visible: true, order: i, format: "number" as const })),
  },
  {
    label: "Date Table",
    description: "All date / timestamp columns with date format",
    applies: (cols) => cols.some(c => /(date|time|created|updated|occurred)/i.test(c.key)),
    build: (cols) =>
      cols
        .filter(c => /(date|time|created|updated|occurred)/i.test(c.key))
        .slice(0, 5)
        .map((c, i) => ({ key: c.key, visible: true, order: i, format: "date" as const, options: { dateFormat: "yyyy-MM-dd" } })),
  },
  {
    label: "All Visible",
    description: "Show every column, alphabetical order",
    applies: () => true,
    build: (cols) =>
      [...cols]
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((c, i) => ({ key: c.key, visible: true, order: i, format: "text" as const })),
  },
  {
    label: "Minimal",
    description: "Only non-ID value columns, first 3",
    applies: () => true,
    build: (cols) =>
      cols
        .filter(c => !/^(id|uuid|_id|created_at|updated_at|org_id)$/i.test(c.key))
        .slice(0, 3)
        .map((c, i) => ({ key: c.key, visible: true, order: i, format: "text" as const })),
  },
]

// ─── Types ─────────────────────────────────────────────────────────

interface Column {
  name: string
  visible: boolean
  order: number
  format?: "text" | "number" | "date" | "currency"
  options?: { decimals?: number; dateFormat?: string; currencySymbol?: string }
}

interface ReportDesignerProps {
  queries: Array<{ id: string; name: string; dataSource: { name: string } }>
  initialData?: {
    id: string
    title: string
    description?: string
    queryId?: string
    format: string
    columnsConfig?: Prisma.JsonObject
  }
  onSuccess?: () => void
}

// ─── Helpers ───────────────────────────────────────────────────────

const makeColumn = (name: string, cfg: Record<string, unknown>): Column => ({
  name,
  visible: typeof cfg.visible === "boolean" ? cfg.visible : true,
  order:   typeof cfg.order   === "number"  ? cfg.order   : 0,
  format:  typeof cfg.format  === "string"  ? (cfg.format as Column["format"]) : "text",
  options: typeof cfg.options === "object" && cfg.options !== null
    ? (cfg.options as Record<string, unknown>) as Column["options"]
    : undefined,
})

function samplePreviewRows(columns: Column[]): Record<string, unknown>[] {
  const sorted = [...columns].sort((a, b) => a.order - b.order)
  return sorted.map((col, i) => {
    const row: Record<string, unknown> = {}
    sorted.forEach(c => { row[c.name] = c.format === "currency" ? 99.99 : c.format === "number" ? i + 1 : `Sample ${i + 1}` })
    return row
  })
}

// ═══════════════════════════════════════════════════════════════════

export function ReportDesigner({
  queries,
  initialData,
  onSuccess,
}: ReportDesignerProps) {
  const router = useRouter()
  const [loading,  setLoading]  = useState(false)
  const [exporting, setExporting] = useState(false)
  const [tab, setTab] = useState<"basic" | "columns" | "preview">("basic")

  const [formData, setFormData] = useState({
    title: initialData?.title || "",
    description: initialData?.description || "",
    queryId: initialData?.queryId || (queries[0]?.id || ""),
    format: initialData?.format || "EXCEL",
  })

  const selectedQuery = useMemo(
    () => queries.find(q => q.id === formData.queryId),
    [queries, formData.queryId],
  )

  // Column name guesses used by presets to match query aliases
  const queryColumnGuesses = useMemo<string[]>(() => {
    if (!selectedQuery) return []
    return [
      "revenue", "amount", "price", "cost", "expense", "margin", "profit", "total",
      "order", "qty", "quantity", "sold", "units", "count",
      "date", "time", "created_at", "updated_at", "occurred_at", "timestamp",
      "name", "email", "status",
    ]
  }, [selectedQuery])

  const guessedColumns = useMemo(() => queryColumnGuesses.map(c => ({ key: c }) as const), [queryColumnGuesses])

  // Presets that match the selected query's column name patterns
  const compatiblePresets = useMemo(
    () => TEMPLATE_PRESETS.filter(p => selectedQuery && p.applies(guessedColumns)),
    [selectedQuery, guessedColumns],
  )

  const [columns, setColumns] = useState<Column[]>(
    initialData?.columnsConfig
      ? Object.entries(initialData.columnsConfig as Record<string, unknown>).map(([name, cfg]) => makeColumn(name, cfg as Record<string, unknown>))
      : []
  )

  // ─── Template Preset Application ─────────────────────────────────

  const applyPreset = (preset: TemplatePreset) => {
    if (!selectedQuery) return
    const newCols: Column[] = preset.build(guessedColumns).map(p => ({
      name: p.key, visible: p.visible, order: p.order, format: p.format, options: p.options,
    }))
    setColumns(newCols)
    toast.success(`"${preset.label}" applied — ${newCols.length} columns`)
  }

  const exportConfig = () => {
    const json = JSON.stringify(currentColumnConfig, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${(formData.title || "report").replace(/\s+/g, "-").toLowerCase()}-columns.json`
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success("Column config exported")
  }

  const currentColumnConfig = useMemo(() => {
    const obj: Prisma.JsonObject = {}
    columns.forEach(col => {
      obj[col.name] = { visible: col.visible, order: col.order, format: col.format || "text", ...(col.options ? { options: col.options } : {}) }
    })
    return obj
  }, [columns])

  const previewRows = useMemo(() => samplePreviewRows(columns), [columns])

  // ─── Form Handlers ───────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleColumnToggle = (i: number) =>
    setColumns(prev => prev.map((c, idx) => idx === i ? { ...c, visible: !c.visible } : c))

  const handleColumnMove = (i: number, dir: "up" | "down") => {
    if ((dir === "up" && i === 0) || (dir === "down" && i === columns.length - 1)) return
    const ni = dir === "up" ? i - 1 : i + 1
    setColumns(prev => prev.map((c, idx) => {
      if (idx === i) return { ...c, order: ni }
      if (idx === ni) return { ...c, order: i }
      return c
    }).sort((a, b) => a.order - b.order).map((c, idx) => ({ ...c, order: idx })))
  }

  const handleFormatChange = (i: number, fmt: string) =>
    setColumns(prev => prev.map((c, idx) => idx === i ? { ...c, format: fmt as Column["format"] } : c))

  const handleOptionChange = (i: number, opt: string, val: string | number) =>
    setColumns(prev => prev.map((c, idx) =>
      idx === i ? { ...c, options: { ...(c.options || {}), [opt]: val } } : c
    ))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        title: formData.title,
        description: formData.description,
        queryId: formData.queryId,
        format: formData.format,
        columnsConfig: Object.keys(currentColumnConfig).length > 0 ? currentColumnConfig : undefined,
      }
      const res = initialData
        ? await updateReport({ ...payload, id: initialData.id })
        : await createReport(payload)
      if (res.success) {
        toast.success(initialData ? "Report updated" : "Report created")
        onSuccess ? onSuccess() : router.push("/reports")
      } else {
        toast.error(res.error || "Failed to save report")
      }
    } catch {
      toast.error("An error occurred while saving")
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    if (!initialData?.id) return
    setExporting(true)
    try {
      const res = await exportReport(initialData.id, formData.format as "PDF" | "EXCEL" | "CSV")
      if (res.success) toast.success(`Export started — ${res.message || ""}`)
      else             toast.error(res.error || "Export failed")
    } finally {
      setExporting(false)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────

  const CardForCol = (col: Column, i: number) => (
    <Card key={col.name} className="p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={col.visible} onChange={() => handleColumnToggle(i)} className="w-4 h-4" />
            <span className="font-medium">{col.name}</span>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => handleColumnMove(i, "up")} disabled={i === 0} className="px-2 py-1 text-sm disabled:opacity-50">↑</button>
            <button type="button" onClick={() => handleColumnMove(i, "down")} disabled={i === columns.length - 1} className="px-2 py-1 text-sm disabled:opacity-50">↓</button>
          </div>
        </div>
        {col.visible && (
          <div className="grid grid-cols-3 gap-3 ml-6">
            <div>
              <label className="text-xs font-medium">Format</label>
              <Select value={col.format || "text"} onValueChange={(v: string | null) => v && handleFormatChange(i, v)}>
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="currency">Currency</option>
              </Select>
            </div>
            {col.format === "number" && (
              <div>
                <label className="text-xs font-medium">Decimals</label>
                <Input type="number" min="0" max="10" value={col.options?.decimals || 0}
                  onChange={e => handleOptionChange(i, "decimals", parseInt(e.target.value))} />
              </div>
            )}
            {col.format === "date" && (
              <div>
                <label className="text-xs font-medium">Format</label>
                <Select value={col.options?.dateFormat || "MM/dd/yyyy"}
                  onValueChange={(v: string | null) => v && handleOptionChange(i, "dateFormat", v)}>
                  <option value="MM/dd/yyyy">MM/dd/yyyy</option>
                  <option value="yyyy-MM-dd">yyyy-MM-dd</option>
                  <option value="dd/MM/yyyy">dd/MM/yyyy</option>
                </Select>
              </div>
            )}
            {col.format === "currency" && (
              <div>
                <label className="text-xs font-medium">Symbol</label>
                <Select value={col.options?.currencySymbol || "$"}
                  onValueChange={(v: string | null) => v && handleOptionChange(i, "currencySymbol", v)}>
                  <option value="$">$ USD</option>
                  <option value="€">€ EUR</option>
                  <option value="£">£ GBP</option>
                  <option value="¥">¥ JPY</option>
                </Select>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{initialData ? "Edit Report" : "Create New Report"}</CardTitle>
          <CardDescription>
            Design a reusable report template — pick a source, configure columns, preview, export.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Tab bar */}
            <div className="flex gap-2 border-b">
              {(["basic", "columns", "preview"] as const).map(t => (
                <button key={t} type="button" onClick={() => setTab(t)}
                  className={`px-4 py-2 border-b-2 transition-colors ${tab === t ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {t === "basic" && "Basic Info"}
                  {t === "columns" && "Column Config"}
                  {t === "preview" && "Preview"}
                </button>
              ))}
            </div>

            {/* ── BASIC INFO ── */}
            {tab === "basic" && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Report Title</Label>
                  <Input id="title" name="title" value={formData.title} onChange={handleInputChange} placeholder="Q1 Sales Report" required />
                </div>
                <div>
                  <Label htmlFor="description">Description (optional)</Label>
                  <Input id="description" name="description" value={formData.description} onChange={handleInputChange} placeholder="Monthly sales by region" />
                </div>
                <div>
                  <Label htmlFor="queryId">Data Source Query</Label>
                  <Select value={formData.queryId} onValueChange={(v: string | null) => v && setFormData(prev => ({ ...prev, queryId: v }))}>
                    {queries.map(q => (<option key={q.id} value={q.id}>{q.name} ({q.dataSource.name})</option>))}
                  </Select>
                  {selectedQuery && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Source: <code className="bg-muted px-1 rounded">{selectedQuery.name}</code> — {selectedQuery.dataSource.name}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="format">Export Format</Label>
                  <Select value={formData.format} onValueChange={(v: string | null) => v && setFormData(prev => ({ ...prev, format: v }))}>
                    <option value="EXCEL">Excel</option>
                    <option value="PDF">PDF</option>
                    <option value="CSV">CSV</option>
                  </Select>
                </div>
              </div>
            )}

            {/* ── COLUMNS ── */}
            {tab === "columns" && (
              <div className="space-y-6">
                {/* Quick Template presets */}
                {compatiblePresets.length > 0 && (
                  <div className="space-y-2">
                    <Label>Quick Templates</Label>
                    <div className="flex flex-wrap gap-2">
                      {compatiblePresets.map(preset => (
                        <Button type="button" variant="outline" size="sm"
                          key={preset.label} onClick={() => applyPreset(preset)}
                          title={preset.description}>{preset.label}</Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Auto-detect column name patterns from the selected query and apply a common layout in one click.
                    </p>
                  </div>
                )}

                {/* Column toolbar */}
                <div className="flex items-center justify-between">
                  <Label className="text-base">Columns ({columns.length})</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setColumns([]); toast.info("All columns cleared") }}>Clear</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={exportConfig}>Export JSON</Button>
                  </div>
                </div>

                {columns.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg">
                    Run a query and Save this report to auto-populate columns, or add columns manually.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {[...columns].sort((a, b) => a.order - b.order).map((col, idx) => CardForCol(col, idx))}
                  </div>
                )}
              </div>
            )}

            {/* ── PREVIEW ── */}
            {tab === "preview" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{formData.title || "Untitled Report"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {columns.length} columns · {previewRows.length} preview rows · {formData.format}
                    </p>
                  </div>
                  {initialData?.id && (
                    <Button type="button" variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
                      {exporting ? "Exporting…" : "Test Export"}
                    </Button>
                  )}
                </div>
                {columns.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center border rounded-lg">
                    Configure columns in the "Column Config" tab to see a preview.
                  </p>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-muted text-muted-foreground">
                        <tr>
                          {[...columns].sort((a, b) => a.order - b.order).map(col => (
                            <th key={col.name} className={`text-left px-3 py-2 font-medium ${!col.visible ? "opacity-40 line-through" : ""}`}>
                              {col.name}
                              <span className="ml-1 text-xs">({col.format || "text"})</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i} className={"border-b " + (i % 2 === 0 ? "bg-background" : "bg-muted/30")}>
                            {[...columns].sort((a, b) => a.order - b.order).map(col => (
                              <td key={col.name} className="px-3 py-2">
                                {String(row[col.name] ?? "—")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── ACTIONS ── */}
            <div className="flex gap-2 justify-end border-t pt-4">
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>Cancel</Button>
              {initialData && (
                <Button type="button" variant="outline" onClick={handleExport} disabled={exporting || loading}>
                  {exporting ? "Exporting…" : "Export"}
                </Button>
              )}
              <Button type="submit" disabled={loading}>
                {loading ? "Saving…" : initialData ? "Update Report" : "Create Report"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
