import ExcelJS from "exceljs"
import type { Prisma } from "@prisma/client"

export interface ColumnDef {
  key: string
  label: string
  visible?: boolean
  order?: number
  format?: "text" | "number" | "date" | "currency"
  width?: number
}

export interface ReportDesign {
  title: string
  description?: string
  columns: ColumnDef[]
  orientation?: "portrait" | "landscape"
  fontSize?: number
  fontName?: string
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"'
  }
  return val
}

function formatCellValue(value: unknown, fmt?: ColumnDef["format"]): string {
  if (value === null || value === undefined) return ""
  switch (fmt) {
    case "currency":
      const num = Number(value)
      if (isNaN(num)) return ""
      return `$${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
    case "number":
      if (typeof value === "number") return value.toLocaleString()
      return String(value)
    case "date":
      const asDate = new Date(value as string | number | Date)
      if (isNaN(asDate.getTime())) return ""
      return asDate.toLocaleDateString()
    default:
      return String(value)
  }
}

export async function generateExcelBuffer(
  design: ReportDesign,
  rows: Prisma.JsonObject[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "ReportFlow"
  workbook.created = new Date()
  const sheet = workbook.addWorksheet(design.title ?? "Report")
  const font = design.fontName ?? "Helvetica"
  const visibleColumns = design.columns
    .filter((c) => c.visible !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  sheet.columns = visibleColumns.map((col) => ({
    header: col.label,
    key: col.key,
    width: col.width ?? 20,
  })) as ExcelJS.Column[]

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, name: font, size: (design.fontSize ?? 11) + 4 }
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } }
  headerRow.alignment = { horizontal: "center" as const }
  rows.forEach((row) => {
    sheet.addRow(visibleColumns.map((col) => formatCellValue(row[col.key], col.format)))
  })
  return Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer)
}

export async function generatePDFBuffer(
  design: ReportDesign,
  rows: Prisma.JsonObject[],
): Promise<Buffer> {
  return new Promise<Buffer>(async (resolve, reject) => {
    const { default: PDFDoc } = await import("pdfkit")
    const doc = new PDFDoc({
      size: "A4",
      layout: design.orientation ?? "portrait",
      margin: 50,
      info: { Title: design.title ?? "Report", Creator: "ReportFlow" },
    })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const font = design.fontName ?? "Helvetica"
    const fontSize = design.fontSize ?? 10
    const ts = fontSize + 2
    const ml = 50 // left margin defaults to 50
    const tw = doc.page.width - ml - 50 // right margin 50

    const visibleColumns = design.columns
      .filter((c) => c.visible !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const nc = Math.min(visibleColumns.length, rows.length ? 7 : 10)
    const cw = tw / nc

    doc.font(font).fontSize(ts + 2)
    doc.text(design.title ?? "Report", { width: tw, align: "center" })
    if (design.description) {
      doc.fontSize(ts).fillColor("#555555")
      doc.text(design.description, { width: tw, align: "center" })
    }
    doc.moveDown(2)

    doc.font(font).fontSize(ts)
    visibleColumns.slice(0, nc).forEach((col, i) => {
      const x = ml + i * cw
      const y = doc.y
      doc.rect(x, y, cw, ts + 3).fill("#fff")
      doc.fill("#1f2937").text(col.label, x + 3, y + 1, { width: cw - 6 })
      doc.fill("#000").fillColor("#000")
      doc.moveDown(ts + 3)
    })

    let alt = false
    doc.fontSize(ts)
    rows.forEach((row) => {
      if (doc.y > doc.page.height - 50 - ts - 10) doc.addPage?.()
      alt = !alt
      visibleColumns.slice(0, nc).forEach((col, i) => {
        const x = ml + i * cw
        const y = doc.y
        doc.rect(x, y, cw, ts + 4).fill(alt ? "#f9fafb" : "#fff")
        doc.fill("#111827").text(formatCellValue(row[col.key], col.format), x + 3, y + 2, { width: cw - 6 })
        doc.fill("#000")
      })
      doc.moveDown(ts + 5)
    })
    doc.end()
  })
}

export async function generateCSVBuffer(
  design: ReportDesign,
  rows: Prisma.JsonObject[],
): Promise<Buffer> {
  const vc = design.columns
    .filter((c) => c.visible !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const header = vc.map((c) => csvEscape(c.label))
  const body = rows.map((r) => vc.map((col) => csvEscape(formatCellValue(r[col.key], col.format))))
  return Buffer.from("\uFEFF" + [header, ...body].map((l) => l.join(",")).join("\r\n"), "utf-8")
}
