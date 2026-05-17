import DashboardLayout from "@/components/layout/dashboard-layout"
import { SessionProvider } from "next-auth/react"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <DashboardLayout>{children}</DashboardLayout>
    </SessionProvider>
  )
}
