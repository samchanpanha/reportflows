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

    // Return metadata for preview; if binary (PDF/Excel), rely on download route
    return NextResponse.json({
      id: file.id,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      createdAt: file.createdAt,
      expiresAt: file.expiresAt,
      downloadUrl: `/api/files/${file.id}/download`,
    })
  } catch (error) {
    console.error("File preview error:", error)
    return NextResponse.json({ error: "Failed to retrieve file info" }, { status: 500 })
  }
}
