import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { QueryForm } from "@/components/query/query-form"

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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
          parameters: query.parameters as Record<string, any> | undefined,
        }}
        onSuccess={() => redirect("/queries")}
      />
    </div>
  )
}
