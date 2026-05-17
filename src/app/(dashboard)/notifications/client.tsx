"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Prisma } from "@prisma/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createNotificationChannel,
  deleteNotificationChannel,
  toggleNotificationChannel,
  testEmailChannel,
  testTelegramChannel,
} from "@/app/actions/notifications"

interface Channel {
  id: string
  type: string
  name: string
  config: Prisma.JsonObject
  enabled: boolean
}

interface NotificationsClientProps {
  channels: Channel[]
}

export function NotificationsClient({ channels: initialChannels }: NotificationsClientProps) {
  const router = useRouter()
  const [channels, setChannels] = useState<Channel[]>(initialChannels)
  const [tab, setTab] = useState<"email" | "telegram">("email")
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)

  const [emailForm, setEmailForm] = useState({
    name: "",
    host: "",
    port: 587,
    user: "",
    password: "",
    from: "",
    testEmail: "",
    secure: false,
  })

  const [telegramForm, setTelegramForm] = useState({
    name: "",
    botToken: "",
    chatId: "",
  })

  const handleEmailInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setEmailForm(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : (name === "port" ? parseInt(value) : value),
    }))
  }

  const handleTelegramInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setTelegramForm(prev => ({ ...prev, [name]: value }))
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await createNotificationChannel({
        type: "EMAIL",
        name: emailForm.name,
        config: {
          host: emailForm.host,
          port: emailForm.port,
          user: emailForm.user,
          password: emailForm.password,
          from: emailForm.from || emailForm.user,
          testEmail: emailForm.testEmail,
          secure: emailForm.secure,
        },
      })

      if (result.success) {
        setEmailForm({
          name: "",
          host: "",
          port: 587,
          user: "",
          password: "",
          from: "",
          testEmail: "",
          secure: false,
        })
        await router.refresh()
      } else {
        console.error(result.error)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleTelegramSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await createNotificationChannel({
        type: "TELEGRAM",
        name: telegramForm.name,
        config: {
          botToken: telegramForm.botToken,
          chatId: telegramForm.chatId,
        },
      })

      if (result.success) {
        setTelegramForm({ name: "", botToken: "", chatId: "" })
        await router.refresh()
      } else {
        console.error(result.error)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this channel?")) return

    try {
      const result = await deleteNotificationChannel(id)
      if (result.success) {
        setChannels(prev => prev.filter(c => c.id !== id))
        await router.refresh()
      } else {
        console.error(result.error)
      }
    } catch (error) {
      console.error("Delete error:", error)
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const result = await toggleNotificationChannel(id, !enabled)
      if (result.success && result.enabled !== undefined) {
        setChannels(prev =>
          prev.map(c => (c.id === id ? { ...c, enabled: result.enabled! } : c))
        )
        await router.refresh()
      } else {
        console.error(result.error)
      }
    } catch (error) {
      console.error("Toggle error:", error)
    }
  }

  const handleTest = async (id: string, type: string) => {
    setTesting(id)

    try {
      const result =
        type === "EMAIL"
          ? await testEmailChannel(id)
          : await testTelegramChannel(id)

      if (result.success) {
        setChannels(prev =>
          prev.map(c => (c.id === id ? { ...c, enabled: true } : c))
        )
        await router.refresh()
      } else {
        console.error(result.error)
      }
    } catch (error) {
      console.error("Test error:", error)
    } finally {
      setTesting(null)
    }
  }

  const emailChannels = channels.filter(c => c.type === "EMAIL")
  const telegramChannels = channels.filter(c => c.type === "TELEGRAM")

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(["email", "telegram"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 border-b-2 transition-colors ${
              tab === t
                ? "border-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "email" ? "📧 Email (SMTP)" : "💬 Telegram"}
          </button>
        ))}
      </div>

      {/* Email Tab */}
      {tab === "email" && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Add Email Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add Email Channel</CardTitle>
              <CardDescription>Configure SMTP settings</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email-name">Channel Name</Label>
                  <Input
                    id="email-name"
                    name="name"
                    value={emailForm.name}
                    onChange={handleEmailInputChange}
                    placeholder="Production Email"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="email-host">SMTP Host</Label>
                    <Input
                      id="email-host"
                      name="host"
                      value={emailForm.host}
                      onChange={handleEmailInputChange}
                      placeholder="smtp.gmail.com"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email-port">Port</Label>
                    <Input
                      id="email-port"
                      name="port"
                      type="number"
                      value={emailForm.port}
                      onChange={handleEmailInputChange}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="email-user">Username/Email</Label>
                  <Input
                    id="email-user"
                    name="user"
                    type="email"
                    value={emailForm.user}
                    onChange={handleEmailInputChange}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="email-password">Password</Label>
                  <Input
                    id="email-password"
                    name="password"
                    type="password"
                    value={emailForm.password}
                    onChange={handleEmailInputChange}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="email-from">From Address</Label>
                  <Input
                    id="email-from"
                    name="from"
                    type="email"
                    value={emailForm.from}
                    onChange={handleEmailInputChange}
                    placeholder="noreply@company.com"
                  />
                </div>

                <div>
                  <Label htmlFor="email-test">Test Email Address</Label>
                  <Input
                    id="email-test"
                    name="testEmail"
                    type="email"
                    value={emailForm.testEmail}
                    onChange={handleEmailInputChange}
                    placeholder="your@email.com"
                  />
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="secure"
                    checked={emailForm.secure}
                    onChange={handleEmailInputChange}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Use secure connection (TLS/SSL)</span>
                </label>

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Creating..." : "Create Email Channel"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Email Channels List */}
          <div className="space-y-3">
            {emailChannels.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No email channels configured
                </CardContent>
              </Card>
            ) : (
              emailChannels.map(channel => (
                <Card key={channel.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{channel.name}</CardTitle>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={channel.enabled}
                          onChange={() => handleToggle(channel.id, channel.enabled)}
                          className="w-4 h-4"
                        />
                        <span className="text-xs text-muted-foreground">
                          {channel.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </label>
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
<p>
                       <span className="text-muted-foreground">Host: </span>
                        {String((channel.config as Prisma.JsonObject).host)}:{String((channel.config as Prisma.JsonObject).port)}
                     </p>
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTest(channel.id, "EMAIL")}
                        disabled={testing === channel.id}
                      >
                        {testing === channel.id ? "Testing..." : "Test"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(channel.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* Telegram Tab */}
      {tab === "telegram" && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Add Telegram Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add Telegram Channel</CardTitle>
              <CardDescription>Configure Telegram bot</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleTelegramSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="tg-name">Channel Name</Label>
                  <Input
                    id="tg-name"
                    name="name"
                    value={telegramForm.name}
                    onChange={handleTelegramInputChange}
                    placeholder="Report Notifications"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="tg-token">Bot Token</Label>
                  <Input
                    id="tg-token"
                    name="botToken"
                    type="password"
                    value={telegramForm.botToken}
                    onChange={handleTelegramInputChange}
                    placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Get from BotFather on Telegram
                  </p>
                </div>

                <div>
                  <Label htmlFor="tg-chat">Chat ID</Label>
                  <Input
                    id="tg-chat"
                    name="chatId"
                    value={telegramForm.chatId}
                    onChange={handleTelegramInputChange}
                    placeholder="123456789"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Your chat ID for receiving messages
                  </p>
                </div>

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Creating..." : "Create Telegram Channel"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Telegram Channels List */}
          <div className="space-y-3">
            {telegramChannels.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No Telegram channels configured
                </CardContent>
              </Card>
            ) : (
              telegramChannels.map(channel => (
                <Card key={channel.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{channel.name}</CardTitle>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={channel.enabled}
                          onChange={() => handleToggle(channel.id, channel.enabled)}
                          className="w-4 h-4"
                        />
                        <span className="text-xs text-muted-foreground">
                          {channel.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </label>
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
<p>
                       <span className="text-muted-foreground">Chat ID: </span>
                        {String((channel.config as Prisma.JsonObject).chatId)}
                     </p>
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTest(channel.id, "TELEGRAM")}
                        disabled={testing === channel.id}
                      >
                        {testing === channel.id ? "Testing..." : "Test"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(channel.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
