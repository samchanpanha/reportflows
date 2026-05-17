import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function DataSourcesPage() {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const sources = await prisma.dataSource.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { createdAt: "desc" },
  })

  const statusColor: Record<string, string> = {
    ACTIVE: "bg-emerald-100 text-emerald-800",
    INACTIVE: "bg-gray-100 text-gray-600",
    ERROR: "bg-red-100 text-red-700",
  }

  const typeIcon: Record<string, string> = {
    POSTGRESQL: "🐘",
    MYSQL: "🐬",
    CSV: "📄",
    API: "🌐",
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Data Sources</h1>
          <p className="text-muted-foreground mt-1">
            Connect and manage your database connections.
          </p>
        </div>
        <span className="text-sm text-muted-foreground">
          {sources.length} source{sources.length !== 1 && "s"}
        </span>
      </div>

      {sources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">🗄️</span>
            <h2 className="text-lg font-semibold">No data sources yet</h2>
            <p className="text-muted-foreground text-sm mt-1 max-w-md">
              Data sources allow you to connect to databases and APIs to pull data for your reports.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sources.map((src) => (
            <Card key={src.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <span>{typeIcon[src.type] || "📦"}</span>
                  {src.name}
                </CardTitle>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    statusColor[src.status] || "bg-gray-100 text-gray-600"
                  }`}
                >
                  {src.status}
                </span>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <p>Type: <span className="font-medium text-foreground">{src.type}</span></p>
                {src.host && (
                  <p>Host: <span className="font-medium text-foreground">{src.host}{src.port ? `:${src.port}` : ""}</span></p>
                )}
                {src.database && (
                  <p>Database: <span className="font-medium text-foreground">{src.database}</span></p>
                )}
                <p className="pt-2 text-xs">
                  Created {new Date(src.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
