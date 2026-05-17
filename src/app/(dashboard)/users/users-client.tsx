"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { createSubUserAction, deleteUserAction, updateUserRoleAction } from "./actions"

type User = {
  id: string
  email: string
  role: string
  createdAt: Date
}

const ROLE_BADGE: Record<string, string> = {
  SUPERADMIN: "bg-purple-100 text-purple-800",
  ORG_ADMIN: "bg-blue-100 text-blue-800",
  EDITOR: "bg-green-100 text-green-800",
  VIEWER: "bg-gray-100 text-gray-800",
}

export default function UsersClient({
  users: initialUsers,
  currentUserId,
  currentUserRole,
}: {
  users: User[]
  currentUserId: string
  currentUserRole: string
}) {
  const [users, setUsers] = useState(initialUsers)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await createSubUserAction(formData)
      if (res?.error) {
        setError(res.error)
      } else {
        setDialogOpen(false)
        // Refresh the page to get updated data
        window.location.reload()
      }
    })
  }

  const handleDelete = (userId: string) => {
    startTransition(async () => {
      const res = await deleteUserAction(userId)
      if (res?.error) alert(res.error)
      else setUsers((prev) => prev.filter((u) => u.id !== userId))
    })
  }

  const handleRoleChange = (userId: string, newRole: string) => {
    startTransition(async () => {
      const res = await updateUserRoleAction(userId, newRole)
      if (res?.error) alert(res.error)
      else setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u))
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground mt-1">Manage users in your organization</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger>
            <Button>+ Add User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input name="email" type="email" placeholder="user@company.com" required disabled={isPending} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <Input name="password" type="password" minLength={8} required disabled={isPending} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Role</label>
                <Select name="role" defaultValue="VIEWER">
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentUserRole === "SUPERADMIN" && <SelectItem value="ORG_ADMIN">Org Admin</SelectItem>}
                    <SelectItem value="EDITOR">Editor</SelectItem>
                    <SelectItem value="VIEWER">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Creating..." : "Create User"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organization Users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-3 px-2">Email</th>
                  <th className="text-left py-3 px-2">Role</th>
                  <th className="text-left py-3 px-2">Joined</th>
                  <th className="text-right py-3 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-muted/30">
                    <td className="py-3 px-2">{user.email}</td>
                    <td className="py-3 px-2">
                      {user.id === currentUserId ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[user.role] || ""}`}>
                          {user.role} (you)
                        </span>
                      ) : (
                        <Select
                          defaultValue={user.role}
                          onValueChange={(val) => val && handleRoleChange(user.id, val)}
                          disabled={isPending}
                        >
                          <SelectTrigger className="h-7 w-36 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {currentUserRole === "SUPERADMIN" && <SelectItem value="ORG_ADMIN">Org Admin</SelectItem>}
                            <SelectItem value="EDITOR">Editor</SelectItem>
                            <SelectItem value="VIEWER">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="py-3 px-2 text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-2 text-right">
                      {user.id !== currentUserId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:border-red-300"
                          onClick={() => handleDelete(user.id)}
                          disabled={isPending}
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
