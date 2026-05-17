import { PrismaClient, Role } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  // Check if already seeded
  const existing = await prisma.user.findUnique({ where: { email: "admin@acme.com" } })
  if (existing) {
    console.log("✅ Seed data already exists, skipping.")
    return
  }

  const org = await prisma.organization.create({
    data: { name: "Acme Corp", plan: "ENTERPRISE" },
  })

  const passwordHash = await bcrypt.hash("admin123", 10)

  await prisma.user.create({
    data: {
      email: "admin@acme.com",
      passwordHash,
      role: "SUPERADMIN" as any,
      orgId: org.id,
    },
  })

  console.log("✅ Seed complete: admin@acme.com / admin123")
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect())
