import { DataSourceForm } from "@/components/datasource/datasource-form"

export default function NewDataSourcePage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Data Source</h1>
        <p className="text-muted-foreground mt-1">
          Create a new connection to a database or API
        </p>
      </div>
      <DataSourceForm />
    </div>
  )
}
