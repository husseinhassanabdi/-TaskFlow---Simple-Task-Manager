import "server-only";

import mongoose from "mongoose";
import connectToDatabase from "@/lib/mongodb";
import WorkspaceMemberModel from "@/models/workspace-member";
import WorkspaceModel from "@/models/workspace";

type AuthorizedWorkspace = {
  id: string;
  ownerId: string;
};

export type WorkspaceAuthorizationResult =
  | {
      authorized: true;
      role: "owner" | "member";
      workspace: AuthorizedWorkspace;
    }
  | {
      authorized: false;
      reason: "not-found";
    };

export async function authorizeWorkspaceAccess(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceAuthorizationResult> {
  if (
    typeof userId !== "string" ||
    userId.trim().length === 0 ||
    !mongoose.isObjectIdOrHexString(workspaceId)
  ) {
    return { authorized: false, reason: "not-found" };
  }

  await connectToDatabase();

  const workspaceObjectId = new mongoose.Types.ObjectId(workspaceId);
  const workspace = await WorkspaceModel.findById(workspaceObjectId)
    .select("ownerId")
    .lean();

  if (!workspace) {
    return { authorized: false, reason: "not-found" };
  }

  const authorizedWorkspace = {
    id: workspace._id.toString(),
    ownerId: workspace.ownerId,
  };

  if (workspace.ownerId === userId) {
    return {
      authorized: true,
      role: "owner",
      workspace: authorizedWorkspace,
    };
  }

  const membership = await WorkspaceMemberModel.findOne({
    workspaceId: workspaceObjectId,
    userId,
  })
    .select("_id")
    .lean();

  if (!membership) {
    return { authorized: false, reason: "not-found" };
  }

  return {
    authorized: true,
    role: "member",
    workspace: authorizedWorkspace,
  };
}
