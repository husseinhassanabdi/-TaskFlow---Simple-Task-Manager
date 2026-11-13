import "server-only";

import mongoose from "mongoose";

type WorkspaceModelFields = {
  name: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
};

const workspaceSchema = new mongoose.Schema<WorkspaceModelFields>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },
    ownerId: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

const WorkspaceModel =
  (mongoose.models.Workspace as mongoose.Model<WorkspaceModelFields> | undefined) ??
  mongoose.model<WorkspaceModelFields>("Workspace", workspaceSchema);

export default WorkspaceModel;
