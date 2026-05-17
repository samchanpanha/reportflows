import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function QueriesPage() {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const queries = await prisma.query.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { updatedAt: "desc" },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Queries</h1>
          <p className="text-muted-foreground mt-1">
            Write and manage your SQL queries.
          </p>
        </div>
        <span className="text-sm text-muted-foreground">
          {queries.length} quer{queries.length !== 1 ? "ies" : "y"}
        </span>
      </div>

      {queries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">💬</span>
            <h2 className="text-lg font-semibold">No queries yet</h2>
            <p className="text-muted-foreground text-sm mt-1 max-w-md">
              Queries let you write SQL to extract data from your connected data sources.
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
                    <th className="text-left py-3 px-4 font-medium">Name</th>
                    <th className="text-left py-3 px-4 font-medium">Description</th>
                    <th className="text-left py-3 px-4 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {queries.map((q) => (
                    <tr key={q.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-medium">{q.name}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {q.description || "—"}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {new Date(q.updatedAt).toLocaleDateString()}
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
