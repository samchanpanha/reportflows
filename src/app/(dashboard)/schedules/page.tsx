import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function SchedulesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Schedules</h1>
        <p className="text-muted-foreground mt-1">Manage scheduled report jobs.</p>
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
