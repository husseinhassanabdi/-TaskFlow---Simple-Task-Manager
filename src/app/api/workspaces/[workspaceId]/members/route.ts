import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import { authorizeWorkspaceAccess } from "@/lib/workspace-authorization";
import WorkspaceMemberModel from "@/models/workspace-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

type SafeUserFields = {
  _id: mongoose.Types.ObjectId | string;
  name?: string;
  email?: string;
  banned?: boolean;
  banExpires?: Date | string | null;
};

function isCurrentlyBanned(user: SafeUserFields) {
  if (user.banned !== true) return false;
  if (user.banExpires === null || user.banExpires === undefined) return true;

  const expiresAt = new Date(user.banExpires).getTime();
  return !Number.isFinite(expiresAt) || expiresAt > Date.now();
}

function isEmail(value: string) {
  if (value.length > 254) return false;
  const [localPart, domain, ...extra] = value.split("@");
  return extra.length === 0 &&
    localPart.length > 0 &&
    localPart.length <= 64 &&
    !/\s/.test(value) &&
    domain.length <= 253 &&
    /^[^\s@]+\.[^\s@]+$/.test(domain);
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId } = await params;
    const access = await authorizeWorkspaceAccess(session.user.id, workspaceId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    await connectToDatabase();

    const memberships = await WorkspaceMemberModel.find({
      workspaceId: new mongoose.Types.ObjectId(access.workspace.id),
    })
      .select("userId role")
      .lean();

    const userIds = [...new Set([access.workspace.ownerId, ...memberships.map(({ userId }) => userId)])];
    const userObjectIds = userIds.map((id) =>
      mongoose.isObjectIdOrHexString(id) ? new mongoose.Types.ObjectId(id) : id,
    );
    const database = mongoose.connection.db;
    if (!database) {
      throw new Error("MongoDB connected without an active database.");
    }

    const users = await database
      .collection<SafeUserFields>("user")
      .find(
        { _id: { $in: userObjectIds } },
        { projection: { name: 1, email: 1 } },
      )
      .toArray();
    const usersById = new Map(users.map((user) => [user._id.toString(), user]));
    const memberIds = new Set<string>();
    const memberEntries = [
      {
        userId: access.workspace.ownerId,
        role: "owner",
      },
      ...memberships
        .filter(({ userId }) => userId !== access.workspace.ownerId)
        .filter(({ userId }) => {
          if (memberIds.has(userId)) return false;
          memberIds.add(userId);
          return true;
        })
        .map(({ userId, role }) => ({ userId, role })),
    ];

    return NextResponse.json({
      members: memberEntries.map(({ userId, role }) => {
        const user = usersById.get(userId);
        return {
          userId,
          name: user?.name ?? null,
          email: user?.email ?? null,
          role,
        };
      }),
    });
  } catch (error) {
    console.error(
      "Failed to retrieve workspace members.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      { error: "Unable to retrieve workspace members." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId } = await params;
    const access = await authorizeWorkspaceAccess(session.user.id, workspaceId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }
    if (access.role !== "owner") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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
      Object.keys(body).length !== 1 ||
      !("email" in body) ||
      typeof body.email !== "string"
    ) {
      return NextResponse.json(
        { error: "Provide only an email address." },
        { status: 400 },
      );
    }

    const email = body.email.trim().toLowerCase();
    if (!isEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) {
      throw new Error("MongoDB connected without an active database.");
    }

    const user = await database
      .collection<SafeUserFields>("user")
      .findOne(
        { email },
        { projection: { name: 1, email: 1, banned: 1, banExpires: 1 } },
      );

    if (!user || isCurrentlyBanned(user)) {
      return NextResponse.json(
        { error: "This account cannot be added to the workspace." },
        { status: 404 },
      );
    }

    const userId = user._id.toString();
    if (userId === access.workspace.ownerId) {
      return NextResponse.json(
        { error: "The workspace owner is already a workspace member." },
        { status: 409 },
      );
    }

    const existingMembership = await WorkspaceMemberModel.exists({
      workspaceId: new mongoose.Types.ObjectId(access.workspace.id),
      userId,
    });
    if (existingMembership) {
      return NextResponse.json(
        { error: "This user is already a workspace member." },
        { status: 409 },
      );
    }

    try {
      const membership = await WorkspaceMemberModel.create({
        workspaceId: new mongoose.Types.ObjectId(access.workspace.id),
        userId,
        role: "member",
      });

      return NextResponse.json(
        {
          member: {
            userId,
            name: user.name ?? null,
            email: user.email ?? null,
            role: membership.role,
          },
        },
        { status: 201 },
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        return NextResponse.json(
          { error: "This user is already a workspace member." },
          { status: 409 },
        );
      }
      throw error;
    }
  } catch (error) {
    console.error(
      "Failed to add workspace member.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      { error: "Unable to add this user to the workspace." },
      { status: 500 },
    );
  }
}
