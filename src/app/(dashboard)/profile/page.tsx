import { auth } from "@/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default async function ProfilePage() {
  const session = await auth()
  if (!session) return null

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Profile</h1>
      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input value={session.user?.email || ""} readOnly />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={session.user?.name || ""} readOnly />
          </div>
          <div>
            <Label>Role</Label>
            <Input value={session.user?.role || "VIEWER"} readOnly />
          </div>
          <div>
            <Label>Organization</Label>
            <Input value={session.user?.orgId || ""} readOnly />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
