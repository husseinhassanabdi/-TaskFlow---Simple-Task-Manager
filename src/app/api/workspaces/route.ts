import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import WorkspaceMemberModel from "@/models/workspace-member";
import WorkspaceModel from "@/models/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const memberships = await WorkspaceMemberModel.find({ userId: session.user.id })
      .select("workspaceId")
      .lean();
    const workspaceIds = [
      ...new Map(
        memberships.map((membership) => [
          membership.workspaceId.toString(),
          membership.workspaceId,
        ]),
      ).values(),
    ];

    const workspaces = await WorkspaceModel.find({
      $or: [
        { ownerId: session.user.id },
        ...(workspaceIds.length > 0 ? [{ _id: { $in: workspaceIds } }] : []),
      ],
    })
      .sort({ updatedAt: -1, _id: -1 })
      .select("name ownerId createdAt updatedAt")
      .lean();

    return NextResponse.json(
      workspaces.map(({ _id, name, ownerId, createdAt, updatedAt }) => ({
        id: _id.toString(),
        name,
        ownerId,
        role: ownerId === session.user.id ? "owner" : "member",
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      })),
    );
  } catch (error) {
    console.error(
      "Failed to retrieve workspaces.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      { error: "Unable to retrieve workspaces." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      !("name" in body) ||
      typeof body.name !== "string"
    ) {
      return NextResponse.json({ error: "A workspace name is required." }, { status: 400 });
    }

    const name = body.name.trim();
    if (name.length < 1 || name.length > 80) {
      return NextResponse.json(
        { error: "Workspace names must be between 1 and 80 characters." },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const workspace = await WorkspaceModel.create({
      name,
      ownerId: session.user.id,
    });

    return NextResponse.json(
      {
        workspace: {
          id: workspace._id.toString(),
          name: workspace.name,
          ownerId: workspace.ownerId,
          role: "owner",
          createdAt: workspace.createdAt.toISOString(),
          updatedAt: workspace.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      return NextResponse.json({ error: "Invalid workspace details." }, { status: 400 });
    }

    console.error(
      "Failed to create workspace.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      { error: "Unable to create workspace." },
      { status: 500 },
    );
  }
}
