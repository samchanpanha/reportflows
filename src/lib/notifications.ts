import nodemailer from "nodemailer"
import { decrypt } from "./encryption"
import { prisma } from "./prisma"
import type { Prisma } from "@prisma/client"

export interface NotificationChannelConfig {
  type: "EMAIL" | "TELEGRAM"
  name: string
  config: Prisma.JsonObject
  enabled: boolean
}

export interface NotificationPayload {
  subject: string
  body: string
  htmlBody?: string
  recipients: string[]
  filePath?: string
  fileName?: string
}

function decryptConfig(config: Prisma.JsonObject): Prisma.JsonObject {
  const pw = config.password
  const bt = config.botToken
  const out: Prisma.JsonObject = { ...config }
  if (typeof pw === "string" && pw.includes(":")) out.password = decrypt(pw)
  if (typeof bt === "string" && bt.includes(":")) out.botToken = decrypt(bt)
  return out
}

export async function getEnabledChannels(
  orgId: string,
  types?: ("EMAIL" | "TELEGRAM")[],
): Promise<NotificationChannelConfig[]> {
const where: Prisma.NotificationChannelWhereInput = { orgId, enabled: true }
if (types?.length) where.type = { in: types }
const rows = await prisma.notificationChannel.findMany({ where })
return rows.map((r) => ({
  type: r.type as "EMAIL" | "TELEGRAM",
  name: r.name,
  config: decryptConfig(r.config as Prisma.JsonObject),
  enabled: r.enabled,
}))
}

export async function sendNotification(
  channel: NotificationChannelConfig,
  payload: NotificationPayload,
): Promise<{ success: boolean; error?: string }> {
  if (channel.type === "EMAIL") {
    return sendEmail(channel.config, payload)
  }
  if (channel.type === "TELEGRAM") {
    return sendTelegram(channel.config, payload)
  }
  return { success: false, error: `Unknown channel type: ${channel.type}` }
}

async function sendEmail(
  config: Prisma.JsonObject,
  payload: NotificationPayload,
): Promise<{ success: boolean; error?: string }> {
  try {
    const pw = typeof config.password === "string" ? config.password : ""
    const password = decrypt(pw)
    if (!password) {
      return { success: false, error: "SMTP password not configured" }
    }

    const transporter = nodemailer.createTransport({
      host: config.host as string,
      port: (config.port as number) ?? 587,
      secure: (config.secure as boolean) ?? false,
      auth: { user: typeof config.user === "string" ? config.user : "", pass: password },
    })

    const attachments: Array<{ path: string; filename?: string }> = []
    if (payload.filePath) {
      attachments.push({ path: payload.filePath, filename: payload.fileName })
    }

    const mailOptions = {
      from: typeof config.from === "string" ? config.from : (typeof config.user === "string" ? config.user : ""),
      to: payload.recipients.join(", "),
      subject: payload.subject,
      text: payload.body,
      html: payload.htmlBody || payload.body,
      ...(attachments.length > 0 ? { attachments } : {}),
    } as Parameters<typeof transporter.sendMail>[0]

    const info = await transporter.sendMail(mailOptions)
    console.log(`[EMAIL] Sent to ${payload.recipients.join(", ")}: ${info.messageId}`)
    return { success: true }
  } catch (error) {
    console.error("[EMAIL] Send failed:", error)
    return { success: false, error: error instanceof Error ? error.message : "Email send failed" }
  }
}

async function sendTelegram(
  config: Prisma.JsonObject,
  payload: NotificationPayload,
): Promise<{ success: boolean; error?: string }> {
  try {
    const bt = typeof config.botToken === "string" ? config.botToken : ""
    const botToken = decrypt(bt)
    const chatId = typeof config.chatId === "string" ? config.chatId : ""

    if (!botToken) {
      return { success: false, error: "Telegram bot token not configured" }
    }

    if (!chatId) {
      return { success: false, error: "Telegram chat ID not configured" }
    }

    // Send notification messages
    for (const recipient of payload.recipients) {
      const text = `${payload.subject}\n\n${payload.body}`
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: recipient || chatId,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Telegram API error: ${res.status} - ${errText}`)
      }
    }

    // Note: Telegram Bot API also supports sendDocument for file attachments if needed
    if (payload.filePath) {
      for (const recipient of payload.recipients) {
        const formData = new FormData()
        formData.append("chat_id", recipient || chatId)
        formData.append("document", new Blob([]), typeof payload.fileName === "string" ? payload.fileName : "report")
        await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
          method: "POST",
          body: formData,
        })
      }
    }

    console.log(`[TELEGRAM] Sent to ${payload.recipients.join(", ")}`)
    return { success: true }
  } catch (error) {
    console.error("[TELEGRAM] Send failed:", error)
    return { success: false, error: error instanceof Error ? error.message : "Telegram send failed" }
  }
}
