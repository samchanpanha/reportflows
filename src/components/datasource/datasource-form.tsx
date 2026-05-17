"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createDataSource, updateDataSource, testDataSourceConnection } from "@/app/actions/datasources"
import type { Prisma } from "@prisma/client"

type DataSourceType = "POSTGRESQL" | "MYSQL" | "CSV" | "API"

interface DataSourceFormProps {
  initialData?: {
    id: string
    name: string
    type: DataSourceType
    connectionDetails: Prisma.JsonValue
    password?: string
  }
  onSuccess?: () => void
}

export function DataSourceForm({ initialData, onSuccess }: DataSourceFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [type, setType] = useState<DataSourceType>(initialData?.type || "POSTGRESQL")
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    password: initialData?.password || "",
    host: "",
    port: 5432,
    database: "",
    username: "",
    baseUrl: "",
    authType: "none",
    authValue: "",
  })

  const details = initialData?.connectionDetails
  if (details && typeof details === "object") {
    Object.assign(formData, {
      host: typeof (details as Record<string, unknown>).host === "string" ? (details as Record<string, unknown>).host : "",
      port: typeof (details as Record<string, unknown>).port === "number" ? (details as Record<string, unknown>).port : 5432,
      database: typeof (details as Record<string, unknown>).database === "string" ? (details as Record<string, unknown>).database : "",
      username: typeof (details as Record<string, unknown>).username === "string" ? (details as Record<string, unknown>).username : "",
      baseUrl: typeof (details as Record<string, unknown>).baseUrl === "string" ? (details as Record<string, unknown>).baseUrl : "",
      authType: typeof (details as Record<string, unknown>).authType === "string" ? (details as Record<string, unknown>).authType : "none",
      authValue: typeof (details as Record<string, unknown>).authValue === "string" ? (details as Record<string, unknown>).authValue : "",
    })
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === "port" ? parseInt(value) : value,
    }))
  }

  const getConnectionDetails = () => {
    switch (type) {
      case "POSTGRESQL":
      case "MYSQL":
        return {
          host: formData.host,
          port: formData.port,
          database: formData.database,
          username: formData.username,
        }
      case "API":
        return {
          baseUrl: formData.baseUrl,
          authType: formData.authType,
          authValue: formData.authValue,
        }
      case "CSV":
        return {}
      default:
        return {}
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload = {
        name: formData.name,
        type,
        connectionDetails: getConnectionDetails(),
        password: formData.password,
      }

      const result = initialData 
        ? await updateDataSource({ ...payload, id: initialData.id })
        : await createDataSource(payload)

      if (result.success) {
        console.log(initialData ? "Data source updated" : "Data source created")
        if (onSuccess) onSuccess()
        else router.push("/data-sources")
      } else {
        console.error(result.error || "Failed to save data source")
      }
    } catch (error) {
      console.error("An error occurred", error)
    } finally {
      setLoading(false)
    }
  }

  const handleTestConnection = async () => {
    if (!initialData?.id) {
      console.log("Save the data source first to test connection")
      return
    }

    setTesting(true)
    try {
      const result = await testDataSourceConnection(initialData.id)
      if (result.success) {
        console.log(result.message || "Connection successful")
      } else {
        console.error(result.error || "Connection failed")
      }
    } catch (error) {
      console.error("Failed to test connection", error)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{initialData ? "Edit Data Source" : "Create New Data Source"}</CardTitle>
        <CardDescription>
          Configure connection details for your data source
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Data Source Name</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="My Database"
                required
              />
            </div>

            <div>
              <Label htmlFor="type">Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as DataSourceType)}>
                <option value="POSTGRESQL">PostgreSQL</option>
                <option value="MYSQL">MySQL</option>
                <option value="API">REST API</option>
                <option value="CSV">CSV File</option>
              </Select>
            </div>
          </div>

          {/* Type-specific fields */}
          {(type === "POSTGRESQL" || type === "MYSQL") && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold">Database Connection</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="host">Host</Label>
                  <Input
                    id="host"
                    name="host"
                    value={formData.host}
                    onChange={handleInputChange}
                    placeholder="localhost"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    name="port"
                    type="number"
                    value={formData.port}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="database">Database</Label>
                  <Input
                    id="database"
                    name="database"
                    value={formData.database}
                    onChange={handleInputChange}
                    placeholder="reportflow"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder={initialData ? "Leave blank to keep existing" : ""}
                  required={!initialData}
                />
              </div>
            </div>
          )}

          {type === "API" && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold">API Configuration</h3>
              <div>
                <Label htmlFor="baseUrl">Base URL</Label>
                <Input
                  id="baseUrl"
                  name="baseUrl"
                  value={formData.baseUrl}
                  onChange={handleInputChange}
                  placeholder="https://api.example.com"
                  required
                />
              </div>
              <div>
                <Label htmlFor="authType">Authentication</Label>
                <Select value={formData.authType} onValueChange={(value: string | null) => 
                  value && setFormData(prev => ({ ...prev, authType: value }))
                }>
                  <option value="none">None</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="api_key">API Key</option>
                  <option value="basic">Basic Auth</option>
                </Select>
              </div>
              {formData.authType !== "none" && (
                <div>
                  <Label htmlFor="authValue">
                    {formData.authType === "bearer" ? "Token" : "API Key / Credentials"}
                  </Label>
                  <Input
                    id="authValue"
                    name="authValue"
                    type="password"
                    value={formData.authValue}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              )}
            </div>
          )}

          {type === "CSV" && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold">CSV File</h3>
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <p className="text-muted-foreground">Drag and drop CSV files here</p>
                <p className="text-sm text-muted-foreground">(Feature coming soon)</p>
              </div>
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
                onClick={handleTestConnection}
                disabled={testing || loading}
              >
                {testing ? "Testing..." : "Test Connection"}
              </Button>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Data Source"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
