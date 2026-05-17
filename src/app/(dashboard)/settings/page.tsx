import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const [org, user] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: session.user.orgId },
      include: {
        _count: {
          select: { users: true, dataSources: true, reports: true, schedules: true },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, role: true, createdAt: true },
    }),
  ])

  if (!org) redirect("/login")

  const planBadge: Record<string, string> = {
    STARTER: "bg-gray-100 text-gray-700",
    BUSINESS: "bg-blue-100 text-blue-700",
    ENTERPRISE: "bg-purple-100 text-purple-700",
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your organization and account settings.
        </p>
      </div>

      {/* Organization Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🏢 Organization
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Organization Name
              </label>
              <div className="text-lg font-semibold">{org.name}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Plan
              </label>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  planBadge[org.plan] || "bg-gray-100 text-gray-700"
                }`}
              >
                {org.plan}
              </span>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              Usage Overview
            </h3>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{org._count.users}</div>
                <div className="text-xs text-muted-foreground">Users</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{org._count.dataSources}</div>
                <div className="text-xs text-muted-foreground">Data Sources</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{org._count.reports}</div>
                <div className="text-xs text-muted-foreground">Reports</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{org._count.schedules}</div>
                <div className="text-xs text-muted-foreground">Schedules</div>
              </div>
            </div>
          </div>

          <div className="border-t pt-4 text-xs text-muted-foreground">
            <p>
              Max Users: {org.maxUsers ?? "Unlimited"} &bull; Registered{" "}
              {new Date(org.createdAt).toLocaleDateString()}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            👤 Your Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Email
              </label>
              <div className="font-medium">{user?.email}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Role
              </label>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                {user?.role}
              </span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground border-t pt-4">
            Account created {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
