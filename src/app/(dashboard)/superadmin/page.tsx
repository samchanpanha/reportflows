import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { hasPermission } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function SuperAdminPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!hasPermission(session.user.role, "canManageSystem")) redirect("/dashboard")

  const [orgs, totalUsers, recentOrgs] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        _count: {
          select: { users: true },
        },
      },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Super Admin</h1>
        <p className="text-muted-foreground mt-1">Global system overview</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Organizations</CardTitle>
            🏢
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orgs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            👥
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Users / Org</CardTitle>
            📊
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {orgs > 0 ? (totalUsers / orgs).toFixed(1) : "0"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Organization list */}
      <Card>
        <CardHeader>
          <CardTitle>All Organizations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-3 px-2">Organization</th>
                  <th className="text-left py-3 px-2">Plan</th>
                  <th className="text-left py-3 px-2">Users</th>
                  <th className="text-left py-3 px-2">Max Users</th>
                  <th className="text-left py-3 px-2">Registered</th>
                </tr>
              </thead>
              <tbody>
                {recentOrgs.map((org) => (
                  <tr key={org.id} className="border-b hover:bg-muted/30">
                    <td className="py-3 px-2 font-medium">{org.name}</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        org.plan === "ENTERPRISE"
                          ? "bg-purple-100 text-purple-800"
                          : org.plan === "BUSINESS"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-700"
                      }`}>
                        {org.plan}
                      </span>
                    </td>
                    <td className="py-3 px-2">{org._count.users}</td>
                    <td className="py-3 px-2 text-muted-foreground">
                      {org.maxUsers ?? "Unlimited"}
                    </td>
                    <td className="py-3 px-2 text-muted-foreground">
                      {new Date(org.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
