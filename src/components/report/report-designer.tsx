"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createReport, updateReport, exportReport } from "@/app/actions/reports"
import type { Prisma } from "@prisma/client"

interface Column {
  name: string
  visible: boolean
  order: number
  format?: "text" | "number" | "date" | "currency"
  options?: {
    decimals?: number
    dateFormat?: string
    currencySymbol?: string
  }
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

export function ReportDesigner({
  queries,
  initialData,
  onSuccess,
}: ReportDesignerProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [tab, setTab] = useState<"basic" | "columns" | "preview">("basic")

  const [formData, setFormData] = useState({
    title: initialData?.title || "",
    description: initialData?.description || "",
    queryId: initialData?.queryId || (queries[0]?.id || ""),
    format: initialData?.format || "EXCEL",
  })

  const [columns, setColumns] = useState<Column[]>(
    initialData?.columnsConfig
      ? (() => {
          const cfg = initialData.columnsConfig
          if (!cfg || typeof cfg !== "object") return []
          return Object.entries(cfg).map(([name, config]) => ({
            name,
            visible: typeof config === "object" && config !== null && "visible" in config 
              ? (config as Record<string, unknown>).visible !== false 
              : true,
            order: typeof config === "object" && config !== null && "order" in config 
              ? (config as Record<string, unknown>).order as number || 0 
              : 0,
            format: typeof config === "object" && config !== null && "format" in config 
              ? (config as Record<string, unknown>).format as Column["format"] || "text" 
              : "text",
            options: typeof config === "object" && config !== null && "options" in config 
              ? (config as Record<string, unknown>).options as Column["options"] 
              : undefined,
          }))
        })()
      : []
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleColumnToggle = (index: number) => {
    setColumns(prev => {
      const updated = [...prev]
      updated[index].visible = !updated[index].visible
      return updated
    })
  }

  const handleColumnMove = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === columns.length - 1)
    ) {
      return
    }

    const newIndex = direction === "up" ? index - 1 : index + 1
    setColumns(prev => {
      const updated = [...prev]
      ;[updated[index], updated[newIndex]] = [updated[newIndex], updated[index]]
      updated.forEach((col, i) => (col.order = i))
      return updated
    })
  }

  const handleColumnFormatChange = (index: number, format: string) => {
    setColumns(prev => {
      const updated = [...prev]
      updated[index].format = format as Column["format"]
      return updated
    })
  }

  const handleColumnOptionChange = (
    index: number,
    option: string,
    value: string | number
  ) => {
    setColumns(prev => {
      const updated = [...prev]
      updated[index].options = updated[index].options || {}
      ;(updated[index].options as Record<string, unknown>)[option] = value
      return updated
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Build columns config
      const columnsConfig: Prisma.JsonObject = {}
      columns.forEach((col, idx) => {
        columnsConfig[col.name] = {
          visible: col.visible,
          order: idx,
          format: col.format,
          options: col.options,
        }
      })

      const payload = {
        title: formData.title,
        description: formData.description,
        queryId: formData.queryId,
        format: formData.format,
        columnsConfig: Object.keys(columnsConfig).length > 0 ? columnsConfig : undefined,
      }

      const result = initialData
        ? await updateReport({ ...payload, id: initialData.id })
        : await createReport(payload)

      if (result.success) {
        console.log(initialData ? "Report updated" : "Report created")
        if (onSuccess) onSuccess()
        else router.push("/reports")
      } else {
        console.error(result.error)
      }
    } catch (error) {
      console.error("Save error:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    if (!initialData?.id) {
      console.log("Save the report first")
      return
    }

    setExporting(true)
    try {
      const result = await exportReport(initialData.id, formData.format as "PDF" | "EXCEL" | "CSV")
      if (result.success) {
        console.log("Export started:", result.downloadUrl)
      } else {
        console.error(result.error)
      }
    } catch (error) {
      console.error("Export error:", error)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{initialData ? "Edit Report" : "Create New Report"}</CardTitle>
          <CardDescription>
            Design and configure your report template
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Tabs */}
            <div className="flex gap-2 border-b">
              {(["basic", "columns", "preview"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 border-b-2 transition-colors ${
                    tab === t
                      ? "border-primary font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "basic" && "Basic Info"}
                  {t === "columns" && "Column Config"}
                  {t === "preview" && "Preview"}
                </button>
              ))}
            </div>

            {/* Basic Tab */}
            {tab === "basic" && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Report Title</Label>
                  <Input
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder="Sales Report"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description (optional)</Label>
                  <Input
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Monthly sales by region"
                  />
                </div>

                <div>
                  <Label htmlFor="queryId">Query</Label>
                  <Select
                    value={formData.queryId}
                    onValueChange={(value: string | null) =>
                      value && setFormData(prev => ({ ...prev, queryId: value }))
                    }
                  >
                    {queries.map(q => (
                      <option key={q.id} value={q.id}>
                        {q.name} ({q.dataSource.name})
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="format">Export Format</Label>
                  <Select
                    value={formData.format}
                    onValueChange={(value: string | null) =>
                      value && setFormData(prev => ({ ...prev, format: value }))
                    }
                  >
                    <option value="EXCEL">Excel</option>
                    <option value="PDF">PDF</option>
                    <option value="CSV">CSV</option>
                  </Select>
                </div>
              </div>
            )}

            {/* Column Config Tab */}
            {tab === "columns" && (
              <div className="space-y-4">
                {columns.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">
                    Run a query first to configure columns
                  </p>
                ) : (
                  <div className="space-y-3">
                    {columns.map((col, idx) => (
                      <Card key={idx} className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={col.visible}
                                onChange={() => handleColumnToggle(idx)}
                                className="w-4 h-4"
                              />
                              <span className="font-medium">{col.name}</span>
                            </div>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => handleColumnMove(idx, "up")}
                                disabled={idx === 0}
                                className="px-2 py-1 text-sm disabled:opacity-50"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() => handleColumnMove(idx, "down")}
                                disabled={idx === columns.length - 1}
                                className="px-2 py-1 text-sm disabled:opacity-50"
                              >
                                ↓
                              </button>
                            </div>
                          </div>

                          {col.visible && (
                            <div className="grid grid-cols-3 gap-3 ml-6">
                              <div>
                                <label className="text-xs font-medium">Format</label>
                                <Select
                                  value={col.format}
                                  onValueChange={(value: string | null) =>
                                    value && handleColumnFormatChange(idx, value)
                                  }
                                >
                                  <option value="text">Text</option>
                                  <option value="number">Number</option>
                                  <option value="date">Date</option>
                                  <option value="currency">Currency</option>
                                </Select>
                              </div>

                              {col.format === "number" && (
                                <div>
                                  <label className="text-xs font-medium">Decimals</label>
                                  <Input
                                    type="number"
                                    min="0"
                                    max="10"
                                    value={col.options?.decimals || 0}
                                    onChange={(e) =>
                                      handleColumnOptionChange(idx, "decimals", parseInt(e.target.value))
                                    }
                                  />
                                </div>
                              )}

                              {col.format === "date" && (
                                <div>
                                  <label className="text-xs font-medium">Format</label>
                                  <Select
                                    value={col.options?.dateFormat || "MM/dd/yyyy"}
                                    onValueChange={(value: string | null) =>
                                      value && handleColumnOptionChange(idx, "dateFormat", value)
                                    }
                                  >
                                    <option value="MM/dd/yyyy">MM/dd/yyyy</option>
                                    <option value="yyyy-MM-dd">yyyy-MM-dd</option>
                                    <option value="dd/MM/yyyy">dd/MM/yyyy</option>
                                  </Select>
                                </div>
                              )}

                              {col.format === "currency" && (
                                <div>
                                  <label className="text-xs font-medium">Symbol</label>
                                  <Select
                                    value={col.options?.currencySymbol || "$"}
                                    onValueChange={(value: string | null) =>
                                      value && handleColumnOptionChange(idx, "currencySymbol", value)
                                    }
                                  >
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
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Preview Tab */}
            {tab === "preview" && (
              <div className="text-sm text-muted-foreground py-8 text-center">
                <p>Preview will show sample data when report is saved</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 justify-end border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={loading}
              >
                Cancel
              </Button>
              {initialData && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExport}
                  disabled={exporting || loading}
                >
                  {exporting ? "Exporting..." : "Export"}
                </Button>
              )}
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Report"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
