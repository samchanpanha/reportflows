import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { QueryForm } from "@/components/query/query-form"
import { rollbackQueryVersion } from "@/app/actions/queries"
import type { Prisma } from "@prisma/client"

export default async function EditQueryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const { id } = await params
  const query = await prisma.query.findUnique({
    where: { id },
  })

  if (!query || query.orgId !== session.user.orgId) {
    redirect("/queries")
  }

  const dataSources = await prisma.dataSource.findMany({
    where: { orgId: session.user.orgId },
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  })

  const versions = await prisma.queryVersion.findMany({
    where: { queryId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/queries" className="inline-block">
        <Button variant="ghost" size="sm">← Back to Queries</Button>
      </Link>

      <div>
        <h1 className="text-3xl font-bold">Edit Query</h1>
        <p className="text-muted-foreground mt-1">
          Update query: {query.name}
        </p>
      </div>

      <QueryForm
        dataSources={dataSources}
        initialData={{
          id: query.id,
          name: query.name,
          description: query.description || undefined,
          dataSourceId: query.dataSourceId,
          sqlText: query.sqlText,
          parameters: query.parameters as Prisma.JsonObject | undefined,
        }}
        onSuccess={() => redirect("/queries")}
      />

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Version History</h2>
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No previous versions.</p>
        ) : (
          <div className="border rounded-lg divide-y">
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 text-sm font-medium text-muted-foreground bg-muted/50">
              <span>Timestamp</span>
              <span className="text-right">Lines</span>
              <span className="text-right w-40">Action</span>
            </div>
            {versions.map((v) => (
              <div
                key={v.id}
                className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3 items-center"
              >
                <div className="min-w-0">
                  <div className="text-sm">
                    {new Date(v.createdAt).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {(v.sqlText || "").length} chars
                  </div>
                </div>
                <span className="text-xs text-muted-foreground text-right tabular-nums">
                  {(v.sqlText || "").split("\n").length} lines
                </span>
                <div className="flex gap-2 justify-end">
                  <form action={async () => { "use server"; await rollbackQueryVersion(id, v.id); }}>
                    <Button type="submit" size="sm" variant="outline">
                      Restore
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}