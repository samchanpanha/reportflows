"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Editor from "@monaco-editor/react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createQuery, updateQuery, executeQuery, getQueryVersions, rollbackQueryVersion } from "@/app/actions/queries"
import type { DataSourceType } from "@prisma/client"

interface QueryFormProps {
  dataSources: Array<{ id: string; name: string; type: string }>
  initialData?: {
    id: string
    name: string
    description?: string
    dataSourceId: string
    sqlText: string
    parameters?: Record<string, any>
  }
  onSuccess?: () => void
}

export function QueryForm({ dataSources, initialData, onSuccess }: QueryFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  const [versions, setVersions] = useState<any[]>([])
  const [results, setResults] = useState<{ columns: string[]; rows: any[] } | null>(null)

  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    description: initialData?.description || "",
    dataSourceId: initialData?.dataSourceId || (dataSources[0]?.id || ""),
    sqlText: initialData?.sqlText || "SELECT * FROM table_name LIMIT 10",
    paramValues: {} as Record<string, any>,
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }))
  }

  const extractParameters = (sql: string): string[] => {
    const matches = sql.match(/\{\{(\w+)\}\}/g) || []
    return matches.map(m => m.replace(/[{}]/g, ""))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        dataSourceId: formData.dataSourceId,
        sqlText: formData.sqlText,
        parameters: Object.keys(formData.paramValues).length > 0 
          ? formData.paramValues 
          : undefined,
      }

      const result = initialData 
        ? await updateQuery({ ...payload, id: initialData.id })
        : await createQuery(payload)

      if (result.success) {
        console.log(initialData ? "Query updated" : "Query created")
        if (onSuccess) onSuccess()
        else router.push("/queries")
      } else {
        console.error(result.error || "Failed to save query")
      }
    } catch (error) {
      console.error("Save error:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async () => {
    if (!initialData?.id) {
      console.log("Save the query first to execute")
      return
    }

    setExecuting(true)
    try {
      const result = await executeQuery(initialData.id, formData.paramValues)
      if (result.success) {
        setResults({ columns: result.columns || [], rows: result.rows || [] })
      } else {
        console.error(result.error || "Failed to execute")
      }
    } catch (error) {
      console.error("Execute error:", error)
    } finally {
      setExecuting(false)
    }
  }

  const handleLoadVersions = async () => {
    if (!initialData?.id) return

    const result = await getQueryVersions(initialData.id)
    if (result.success) {
      setVersions(result.versions || [])
      setShowVersions(true)
    }
  }

  const handleRollback = async (versionId: string) => {
    if (!initialData?.id) return

    const result = await rollbackQueryVersion(initialData.id, versionId)
    if (result.success) {
      setFormData(prev => ({ ...prev, sqlText: formData.sqlText }))
      setShowVersions(false)
      console.log("Rolled back to previous version")
    }
  }

  const parameters = extractParameters(formData.sqlText)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{initialData ? "Edit Query" : "Create New Query"}</CardTitle>
          <CardDescription>
            Write and test SQL queries against your data sources
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Query Name</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Monthly Sales Report"
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
                  placeholder="Fetches sales data for reports"
                />
              </div>

              <div>
                <Label htmlFor="dataSourceId">Data Source</Label>
                <Select 
                  value={formData.dataSourceId} 
                  onValueChange={(value: string | null) => 
                    value && setFormData(prev => ({ ...prev, dataSourceId: value }))
                  }
                >
                  {dataSources.map(ds => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name} ({ds.type})
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* SQL Editor */}
            <div className="border-t pt-4">
              <Label htmlFor="sqlText">SQL Query</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Use {"{{paramName}}"} for dynamic parameters
              </p>
              <Editor
                height="300px"
                defaultLanguage="sql"
                value={formData.sqlText}
                onChange={(value) => setFormData(prev => ({ ...prev, sqlText: value || "" }))}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: "on",
                }}
              />
            </div>

            {/* Parameters */}
            {parameters.length > 0 && (
              <div className="border-t pt-4 space-y-3">
                <h3 className="font-semibold">Query Parameters</h3>
                {parameters.map((param) => (
                  <div key={param}>
                    <Label htmlFor={`param-${param}`}>{param}</Label>
                    <Input
                      id={`param-${param}`}
                      placeholder={`Value for {{${param}}}}`}
                      onChange={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          paramValues: { ...prev.paramValues, [param]: e.target.value },
                        }))
                      }
                    />
                  </div>
                ))}
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
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleLoadVersions}
                    disabled={loading}
                  >
                    Version History
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleExecute}
                    disabled={executing || loading}
                  >
                    {executing ? "Executing..." : "Execute"}
                  </Button>
                </>
              )}
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Query"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Results Table */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Query Results</CardTitle>
            <CardDescription>
              {results.rows.length} rows returned
            </CardDescription>
          </CardHeader>
          <CardContent>
            {results.rows.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No results</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      {results.columns.map((col) => (
                        <th key={col} className="text-left px-4 py-2 font-medium">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.rows.slice(0, 20).map((row, idx) => (
                      <tr key={idx} className="border-b">
                        {results.columns.map((col) => (
                          <td key={`${idx}-${col}`} className="px-4 py-2">
                            {JSON.stringify(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Version History */}
      {showVersions && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Version History</CardTitle>
          </CardHeader>
          <CardContent>
            {versions.length === 0 ? (
              <p className="text-muted-foreground">No previous versions</p>
            ) : (
              <div className="space-y-2">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-2 border rounded">
                    <span className="text-sm">
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRollback(v.id)}
                    >
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
