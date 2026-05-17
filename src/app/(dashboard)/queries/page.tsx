import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function QueriesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Queries</h1>
        <p className="text-muted-foreground mt-1">Manage and write your SQL queries.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p>This feature will be implemented soon.</p>
        </CardContent>
      </Card>
    </div>
  )
}
