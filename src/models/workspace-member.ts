import "server-only";

import mongoose from "mongoose";

export type WorkspaceMemberRole = "member";

type WorkspaceMemberModelFields = {
  workspaceId: mongoose.Types.ObjectId;
  userId: string;
  role: WorkspaceMemberRole;
  createdAt: Date;
  updatedAt: Date;
};

const workspaceMemberSchema = new mongoose.Schema<WorkspaceMemberModelFields>(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
      enum: ["member"] satisfies WorkspaceMemberRole[],
      default: "member",
    },
  },
  {
    timestamps: true,
  },
);

workspaceMemberSchema.index(
  { workspaceId: 1, userId: 1 },
  { unique: true },
);
workspaceMemberSchema.index({ userId: 1, workspaceId: 1 });

const WorkspaceMemberModel =
  (mongoose.models.WorkspaceMember as
    | mongoose.Model<WorkspaceMemberModelFields>
    | undefined) ??
  mongoose.model<WorkspaceMemberModelFields>("WorkspaceMember", workspaceMemberSchema);

export default WorkspaceMemberModel;
