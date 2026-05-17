import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { DataSourceForm } from "@/components/datasource/datasource-form"
import type { Prisma, DataSourceType } from "@prisma/client"

export default async function EditDataSourcePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  const { id } = await params
  const datasource = await prisma.dataSource.findUnique({
    where: { id },
  })

  if (!datasource || datasource.orgId !== session.user.orgId) {
    redirect("/data-sources")
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Edit Data Source</h1>
        <p className="text-muted-foreground mt-1">
          Update connection details for {datasource.name}
        </p>
      </div>
      <DataSourceForm
        initialData={{
          id: datasource.id,
          name: datasource.name,
          type: datasource.type as DataSourceType,
          connectionDetails: datasource.connectionDetails as Prisma.JsonObject,
        }}
        onSuccess={() => redirect("/data-sources")}
      />
    </div>
  )
}
