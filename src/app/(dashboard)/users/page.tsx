import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { hasPermission } from "@/lib/permissions"
import { redirect } from "next/navigation"
import UsersClient from "./users-client"

export default async function UsersPage() {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")
  if (!hasPermission(session.user.role, "canManageUsers")) redirect("/dashboard")

  const users = await prisma.user.findMany({
    where: { orgId: session.user.orgId },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  })

  return (
    <UsersClient
      users={users}
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
    />
  )
}
