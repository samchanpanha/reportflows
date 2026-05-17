import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function QueriesPage() {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const queries = await prisma.query.findMany({
    where: { orgId: session.user.orgId },
    include: { dataSource: { select: { name: true, type: true } } },
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
        <Link href="/queries/new">
          <Button>+ New Query</Button>
        </Link>
      </div>

      {queries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">💬</span>
            <h2 className="text-lg font-semibold">No queries yet</h2>
            <p className="text-muted-foreground text-sm mt-1 max-w-md">
              Queries let you write SQL to extract data from your connected data sources.
            </p>
            <Link href="/queries/new" className="mt-4">
              <Button>Create your first query</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {queries.map((query) => (
            <Link key={query.id} href={`/queries/${query.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{query.name}</CardTitle>
                      {query.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {query.description}
                        </p>
                      )}
                    </div>
                    <span className="text-xs bg-muted px-2 py-1 rounded">
                      {query.dataSource.type}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                  <p>Data Source: <span className="font-medium text-foreground">{query.dataSource.name}</span></p>
                  <p>Updated: <span className="font-medium text-foreground">{new Date(query.updatedAt).toLocaleDateString()}</span></p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
