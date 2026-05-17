import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { logAudit } from "@/lib/audit"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // In a real app, link to existing org or create a personal org automatically
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const { email, password } = credentials as {
          email: string; password: string
        }
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user || !user.passwordHash) return null
        const isValid = await bcrypt.compare(password, user.passwordHash)
        if (!isValid) return null
        return user
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Log audit event
      if (user && account) {
        if (account.provider === "credentials") {
          await logAudit({
            orgId: user.orgId,
            userId: user.id,
            action: "LOGIN_CREDENTIALS",
            entityType: "user",
          })
        } else {
          // OAuth login
          await logAudit({
            orgId: user.orgId,
            userId: user.id,
            action: "LOGIN_OAUTH",
            entityType: "user",
          })
        }
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.orgId = user.orgId
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
        session.user.orgId = token.orgId as string
        session.user.role = token.role as string
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
})
