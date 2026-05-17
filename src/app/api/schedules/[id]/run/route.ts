import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { runScheduleNow } from "@/app/actions/schedules"

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
    const result = await runScheduleNow(id)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("Run schedule API error:", error)
    return NextResponse.json({ error: "Failed to run schedule" }, { status: 500 })
  }
}
