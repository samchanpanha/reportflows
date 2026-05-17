import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Notifications</h1>
        <p className="text-muted-foreground mt-1">Configure your notification channels.</p>
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
