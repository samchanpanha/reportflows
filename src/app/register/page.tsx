"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useState, useTransition } from "react"
import { registerAction } from "./actions"
import Link from "next/link"

export default function RegisterPage() {
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    
    const formData = new FormData(e.currentTarget)
    
    startTransition(async () => {
      const res = await registerAction(formData)
      if (res?.error) {
        setError(res.error)
      } else if (res?.success) {
        setSuccess(true)
      }
    })
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md text-center py-6">
          <CardHeader>
            <CardTitle className="text-2xl text-green-600">Registration Successful!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">Your organization has been created.</p>
            <Link href="/login" className="w-full">
              <Button className="w-full">Go to Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create an Account</CardTitle>
          <CardDescription>Register your company to get started with ReportFlow</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Company Name</label>
              <Input
                name="companyName"
                placeholder="Acme Corp"
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                name="email"
                placeholder="admin@acme.com"
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                name="password"
                required
                minLength={8}
                disabled={isPending}
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Creating Account..." : "Register"}
            </Button>
          </form>
          
          <div className="text-center text-sm text-muted-foreground pt-4">
            Already have an account? <Link href="/login" className="text-primary hover:underline">Log in</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
