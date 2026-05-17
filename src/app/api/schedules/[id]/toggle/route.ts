import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { toggleSchedule } from "@/app/actions/schedules"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = (await _req.json()) as { enabled?: boolean }
    const result = await toggleSchedule(id, body.enabled ?? false)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("Toggle schedule API error:", error)
    return NextResponse.json({ error: "Failed to toggle schedule" }, { status: 500 })
  }
}
