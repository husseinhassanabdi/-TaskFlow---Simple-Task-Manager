import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authorizeWorkspaceAccess } from "@/lib/workspace-authorization";
import WorkspaceMemberModel from "@/models/workspace-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ workspaceId: string; userId: string }>;
};

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, userId } = await params;
    const access = await authorizeWorkspaceAccess(session.user.id, workspaceId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }
    if (access.role !== "owner") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (!userId || userId.length > 200) {
      return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
    }
    if (userId === access.workspace.ownerId) {
      return NextResponse.json(
        { error: "The workspace owner cannot be removed as a member." },
        { status: 400 },
      );
    }

    const result = await WorkspaceMemberModel.deleteOne({
      workspaceId: new mongoose.Types.ObjectId(access.workspace.id),
      userId,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Workspace member not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ message: "Workspace member removed." });
  } catch (error) {
    console.error(
      "Failed to remove workspace member.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      { error: "Unable to remove workspace member." },
      { status: 500 },
    );
  }
}
