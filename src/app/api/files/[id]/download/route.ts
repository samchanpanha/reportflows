import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const file = await prisma.generatedFile.findUnique({
      where: { id },
    })

    if (!file || file.orgId !== session.user.orgId) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    if (file.expiresAt && new Date(file.expiresAt) < new Date()) {
      return NextResponse.json({ error: "File has expired" }, { status: 410 })
    }

    const { readFileSync } = await import("fs")
    const { join } = await import("path")
    const filePath = join(process.cwd(), "public", file.filePath.replace(/^\/+/, ""))

    try {
      const data = readFileSync(filePath)
      return new NextResponse(data, {
        status: 200,
        headers: {
          "Content-Type": file.fileType === "csv"
            ? "text/csv; charset=utf-8"
            : file.fileType === "pdf"
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${file.fileName}"`,
          "Content-Length": data.length.toString(),
        },
      })
    } catch {
      return NextResponse.json({ error: "File not accessible on disk" }, { status: 500 })
    }
  } catch (error) {
    console.error("File download error:", error)
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 })
  }
}
