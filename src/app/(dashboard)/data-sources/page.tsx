import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function DataSourcesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Data Sources</h1>
        <p className="text-muted-foreground mt-1">Connect and manage your data sources.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p>This feature will be implemented in Phase 2.</p>
        </CardContent>
      </Card>
    </div>
  )
}
