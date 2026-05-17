"use server"

import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"

const registerSchema = z.object({
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export async function registerAction(formData: FormData) {
  try {
    const data = Object.fromEntries(formData.entries())
    const parsed = registerSchema.safeParse(data)

    if (!parsed.success) {
      return { error: parsed.error.issues[0].message }
    }

    const { companyName, email, password } = parsed.data

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return { error: "A user with this email already exists." }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create Organization and User in a transaction
    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: companyName,
          plan: "STARTER",
        },
      })

      await tx.user.create({
        data: {
          email,
          passwordHash,
          role: "ORG_ADMIN",
          orgId: org.id,
        },
      })
      
      // We could also log an audit event here
      await tx.auditLog.create({
        data: {
          orgId: org.id,
          action: "ORGANIZATION_REGISTERED",
          entityType: "organization",
          entityId: org.id,
        }
      })
    })

    return { success: true }
  } catch (error) {
    console.error("Registration error:", error)
    return { error: "An unexpected error occurred during registration." }
  }
}
