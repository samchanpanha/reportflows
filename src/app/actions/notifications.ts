"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { encrypt, decrypt } from "@/lib/encryption"
import { redirect } from "next/navigation"
import { z } from "zod"
import nodemailer from "nodemailer"

const createChannelSchema = z.object({
  type: z.enum(["EMAIL", "TELEGRAM"]),
  name: z.string().min(1, "Name is required"),
  config: z.record(z.string(), z.any()),
})

const updateChannelSchema = createChannelSchema.extend({
  id: z.string().uuid(),
})

export async function createNotificationChannel(formData: unknown) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const validated = createChannelSchema.parse(formData)

    // Encrypt sensitive config fields
    const encryptedConfig = { ...validated.config }
    if (validated.type === "EMAIL" && encryptedConfig.password) {
      encryptedConfig.password = encrypt(encryptedConfig.password)
    }
    if (validated.type === "TELEGRAM" && encryptedConfig.botToken) {
      encryptedConfig.botToken = encrypt(encryptedConfig.botToken)
    }

    const channel = await prisma.notificationChannel.create({
      data: {
        orgId: session.user.orgId,
        type: validated.type,
        name: validated.name,
        config: encryptedConfig,
        enabled: false, // Disabled until tested
      },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "CHANNEL_CREATED",
      entityType: "notification_channel",
      entityId: channel.id,
      details: { type: validated.type, name: validated.name },
    })

    return { success: true, id: channel.id }
  } catch (error) {
    console.error("Create channel error:", error)
    const message = error instanceof z.ZodError 
      ? error.issues[0]?.message
      : "Failed to create notification channel"
    return { success: false, error: message }
  }
}

export async function updateNotificationChannel(formData: unknown) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const validated = updateChannelSchema.parse(formData)

    const existing = await prisma.notificationChannel.findUnique({
      where: { id: validated.id },
    })

    if (!existing || existing.orgId !== session.user.orgId) {
      return { success: false, error: "Channel not found" }
    }

    // Encrypt sensitive config fields
    const encryptedConfig = { ...validated.config }
    if (validated.type === "EMAIL" && encryptedConfig.password) {
      // Only re-encrypt if it's not already encrypted
      if (!encryptedConfig.password.includes(":")) {
        encryptedConfig.password = encrypt(encryptedConfig.password)
      }
    }
    if (validated.type === "TELEGRAM" && encryptedConfig.botToken) {
      if (!encryptedConfig.botToken.includes(":")) {
        encryptedConfig.botToken = encrypt(encryptedConfig.botToken)
      }
    }

    const updated = await prisma.notificationChannel.update({
      where: { id: validated.id },
      data: {
        name: validated.name,
        config: encryptedConfig,
      },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "CHANNEL_UPDATED",
      entityType: "notification_channel",
      entityId: validated.id,
      details: { name: validated.name },
    })

    return { success: true, id: updated.id }
  } catch (error) {
    console.error("Update channel error:", error)
    const message = error instanceof z.ZodError 
      ? error.issues[0]?.message
      : "Failed to update channel"
    return { success: false, error: message }
  }
}

export async function deleteNotificationChannel(id: string) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const channel = await prisma.notificationChannel.findUnique({
      where: { id },
    })

    if (!channel || channel.orgId !== session.user.orgId) {
      return { success: false, error: "Channel not found" }
    }

    await prisma.notificationChannel.delete({ where: { id } })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "CHANNEL_DELETED",
      entityType: "notification_channel",
      entityId: id,
      details: { type: channel.type, name: channel.name },
    })

    return { success: true }
  } catch (error) {
    console.error("Delete channel error:", error)
    return { success: false, error: "Failed to delete channel" }
  }
}

export async function toggleNotificationChannel(id: string, enabled: boolean) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const channel = await prisma.notificationChannel.findUnique({
      where: { id },
    })

    if (!channel || channel.orgId !== session.user.orgId) {
      return { success: false, error: "Channel not found" }
    }

    const updated = await prisma.notificationChannel.update({
      where: { id },
      data: { enabled },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "CHANNEL_TOGGLED",
      entityType: "notification_channel",
      entityId: id,
      details: { enabled },
    })

    return { success: true, enabled: updated.enabled }
  } catch (error) {
    console.error("Toggle channel error:", error)
    return { success: false, error: "Failed to toggle channel" }
  }
}

export async function testEmailChannel(id: string) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const channel = await prisma.notificationChannel.findUnique({
      where: { id },
    })

    if (!channel || channel.orgId !== session.user.orgId) {
      return { success: false, error: "Channel not found" }
    }

    if (channel.type !== "EMAIL") {
      return { success: false, error: "Not an email channel" }
    }

    const config = channel.config as Record<string, any>
    
    // Decrypt password
    let password = config.password
    if (password?.includes(":")) {
      password = decrypt(password)
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port || 587,
      secure: config.secure || false,
      auth: {
        user: config.user,
        pass: password,
      },
    })

    // Send test email
    await transporter.sendMail({
      from: config.from || config.user,
      to: config.testEmail || session.user.email,
      subject: "ReportFlow - Test Email",
      html: "<p>This is a test email from ReportFlow. Your email channel is configured correctly!</p>",
    })

    // If successful, enable the channel
    await prisma.notificationChannel.update({
      where: { id },
      data: { enabled: true },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "CHANNEL_TEST_SENT",
      entityType: "notification_channel",
      entityId: id,
      details: { type: "EMAIL" },
    })

    return { success: true, message: "Test email sent successfully" }
  } catch (error) {
    console.error("Test email error:", error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to send test email"
    }
  }
}

export async function testTelegramChannel(id: string) {
  const session = await auth()
  if (!session?.user?.orgId) redirect("/login")

  try {
    const channel = await prisma.notificationChannel.findUnique({
      where: { id },
    })

    if (!channel || channel.orgId !== session.user.orgId) {
      return { success: false, error: "Channel not found" }
    }

    if (channel.type !== "TELEGRAM") {
      return { success: false, error: "Not a Telegram channel" }
    }

    const config = channel.config as Record<string, any>
    
    // Decrypt bot token
    let botToken = config.botToken
    if (botToken?.includes(":")) {
      botToken = decrypt(botToken)
    }

    // Test Telegram API
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
    
    if (!response.ok) {
      return { success: false, error: "Invalid Telegram bot token" }
    }

    // If successful, enable the channel
    await prisma.notificationChannel.update({
      where: { id },
      data: { enabled: true },
    })

    await logAudit({
      orgId: session.user.orgId,
      userId: session.user.id,
      action: "CHANNEL_TEST_SENT",
      entityType: "notification_channel",
      entityId: id,
      details: { type: "TELEGRAM" },
    })

    return { success: true, message: "Telegram channel verified successfully" }
  } catch (error) {
    console.error("Test telegram error:", error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to verify Telegram channel"
    }
  }
}
