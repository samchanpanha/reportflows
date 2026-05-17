"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { hasPermission } from "@/lib/permissions"
import { logAudit } from "@/lib/audit"
import type { Role } from "@prisma/client"

const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ORG_ADMIN", "EDITOR", "VIEWER"]),
})

export async function createSubUserAction(formData: FormData) {
  const session = await auth()
  if (!session?.user?.orgId) return { error: "Not authenticated" }
  if (!hasPermission(session.user.role, "canManageUsers")) {
    return { error: "Insufficient permissions" }
  }

  try {
    const data = Object.fromEntries(formData.entries())
    const parsed = createUserSchema.safeParse(data)
    if (!parsed.success) return { error: parsed.error.issues[0].message }

    const { email, password, role } = parsed.data
    const orgId = session.user.orgId

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return { error: "A user with this email already exists." }

    const passwordHash = await bcrypt.hash(password, 10)
    const newUser = await prisma.user.create({
      data: { email, passwordHash, role: role as Role, orgId },
    })

    await logAudit({
      orgId,
      userId: session.user.id,
      action: "USER_CREATED",
      entityType: "user",
      entityId: newUser.id,
      details: { role },
    })

    return { success: true }
  } catch (error) {
    console.error("Create user error:", error)
    return { error: "Failed to create user." }
  }
}

export async function deleteUserAction(userId: string) {
  const session = await auth()
  if (!session?.user?.orgId) return { error: "Not authenticated" }
  if (!hasPermission(session.user.role, "canManageUsers")) {
    return { error: "Insufficient permissions" }
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || user.orgId !== session.user.orgId) {
      return { error: "User not found." }
    }
    if (user.id === session.user.id) {
      return { error: "You cannot delete yourself." }
    }

    await prisma.user.delete({ where: { id: userId } })
    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "USER_DELETED",
      entityType: "user",
      entityId: userId,
    })

    return { success: true }
  } catch (error) {
    console.error("Delete user error:", error)
    return { error: "Failed to delete user." }
  }
}

export async function updateUserRoleAction(userId: string, role: string) {
  const session = await auth()
  if (!session?.user?.orgId) return { error: "Not authenticated" }
  if (!hasPermission(session.user.role, "canManageUsers")) {
    return { error: "Insufficient permissions" }
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || user.orgId !== session.user.orgId) {
      return { error: "User not found." }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { role: role as Role },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "USER_ROLE_UPDATED",
      entityType: "user",
      entityId: userId,
      details: { newRole: role },
    })

    return { success: true }
  } catch (error) {
    console.error("Update role error:", error)
    return { error: "Failed to update role." }
  }
}
