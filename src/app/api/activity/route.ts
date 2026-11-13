import { NextResponse } from "next/server";
import TaskActivityModel from "@/models/task-activity";
import { getSession } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const activities = await TaskActivityModel.find({ userId: session.user.id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(10)
      .select("-userId -__v")
      .lean();

    return NextResponse.json(
      activities.map(({ _id, type, taskTitle, createdAt }) => ({
        id: _id.toString(),
        type,
        taskTitle,
        createdAt: createdAt.toISOString(),
      })),
    );
  } catch (error) {
    console.error(
      "Failed to retrieve task activity.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      { error: "Unable to retrieve recent activity." },
      { status: 500 },
    );
  }
}
