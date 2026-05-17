import nodemailer from "nodemailer"
import { decrypt } from "./encryption"
import { prisma } from "./prisma"

export interface NotificationChannelConfig {
  type: "EMAIL" | "TELEGRAM"
  name: string
  config: Record<string, any>
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

function decryptConfig(config: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...config }
  if (out.password?.includes(":")) out.password = decrypt(out.password)
  if (out.botToken?.includes(":")) out.botToken = decrypt(out.botToken)
  return out
}

export async function getEnabledChannels(
  orgId: string,
  types?: ("EMAIL" | "TELEGRAM")[],
): Promise<NotificationChannelConfig[]> {
  const where: any = { orgId, enabled: true }
  if (types?.length) where.type = { in: types }
  const rows = await prisma.notificationChannel.findMany({ where })
  return rows.map((r) => ({
    type: r.type as "EMAIL" | "TELEGRAM",
    name: r.name,
    config: decryptConfig(r.config as Record<string, any>),
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
  config: Record<string, any>,
  payload: NotificationPayload,
): Promise<{ success: boolean; error?: string }> {
  try {
    const password = decrypt(config.password ?? "")
    if (!password) {
      return { success: false, error: "SMTP password not configured" }
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port || 587,
      secure: config.secure || false,
      auth: { user: config.user, pass: password },
    })

    const attachments: Array<{ path: string; filename?: string }> = []
    if (payload.filePath) {
      attachments.push({ path: payload.filePath, filename: payload.fileName })
    }

    const mailOptions: Record<string, any> = {
      from: config.from || config.user,
      to: payload.recipients.join(", "),
      subject: payload.subject,
      text: payload.body,
      html: payload.htmlBody || payload.body,
      attachments: attachments.length > 0 ? attachments : undefined,
    }

    const info = await transporter.sendMail(mailOptions)
    console.log(`[EMAIL] Sent to ${payload.recipients.join(", ")}: ${info.messageId}`)
    return { success: true }
  } catch (error) {
    console.error("[EMAIL] Send failed:", error)
    return { success: false, error: error instanceof Error ? error.message : "Email send failed" }
  }
}

async function sendTelegram(
  config: Record<string, any>,
  payload: NotificationPayload,
): Promise<{ success: boolean; error?: string }> {
  try {
    const botToken = decrypt(config.botToken ?? "")
    const chatId = config.chatId

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
        formData.append("document", new Blob([]), payload.fileName || "report")
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
