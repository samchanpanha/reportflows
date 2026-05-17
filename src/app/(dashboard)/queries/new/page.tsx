import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { QueryForm } from "@/components/query/query-form"

export default async function NewQueryPage() {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const dataSources = await prisma.dataSource.findMany({
    where: { orgId: session.user.orgId },
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  })

  if (dataSources.length === 0) {
    redirect("/data-sources?message=Create+a+data+source+first")
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Query</h1>
        <p className="text-muted-foreground mt-1">
          Write a SQL query to fetch data from your data sources
        </p>
      </div>
      <QueryForm dataSources={dataSources} />
    </div>
  )
}
