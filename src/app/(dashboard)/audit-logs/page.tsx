import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"


export default async function AuditLogsPage() {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const logs = await prisma.auditLog.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  const actionColor: Record<string, string> = {
    LOGIN_CREDENTIALS: "bg-blue-100 text-blue-700",
    LOGIN_OAUTH: "bg-indigo-100 text-indigo-700",
    USER_CREATED: "bg-emerald-100 text-emerald-700",
    USER_DELETED: "bg-red-100 text-red-700",
    USER_ROLE_CHANGED: "bg-amber-100 text-amber-700",
    DATASOURCE_CREATED: "bg-green-100 text-green-700",
    REPORT_EXPORTED: "bg-purple-100 text-purple-700",
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Audit Logs</h1>
          <p className="text-muted-foreground mt-1">
            Review all system activity and security events.
          </p>
        </div>
        <span className="text-sm text-muted-foreground">
          Showing last {logs.length} events
        </span>
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">📝</span>
            <h2 className="text-lg font-semibold">No audit logs yet</h2>
            <p className="text-muted-foreground text-sm mt-1 max-w-md">
              Activity will be recorded here as users interact with the system.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium">Action</th>
                    <th className="text-left py-3 px-4 font-medium">Entity</th>
                    <th className="text-left py-3 px-4 font-medium">Entity ID</th>
                    <th className="text-left py-3 px-4 font-medium">IP Address</th>
                    <th className="text-left py-3 px-4 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            actionColor[log.action] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {log.entityType}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs font-mono">
                        {log.entityId ? log.entityId.slice(0, 8) + "…" : "—"}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {log.ipAddress || "—"}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
