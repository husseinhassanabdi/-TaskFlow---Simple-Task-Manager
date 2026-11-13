import "server-only";

import mongoose from "mongoose";
import type { TaskActivityType } from "@/types/activity";

type TaskActivityModelFields = {
  userId: string;
  taskId: string;
  type: TaskActivityType;
  taskTitle: string;
  createdAt: Date;
  updatedAt: Date;
};

const taskActivitySchema = new mongoose.Schema<TaskActivityModelFields>(
  {
    userId: {
      type: String,
      required: true,
      maxlength: 128,
    },
    taskId: {
      type: String,
      required: true,
      match: /^[a-f\d]{24}$/i,
    },
    type: {
      type: String,
      required: true,
      enum: ["created", "updated", "completed", "deleted"] satisfies TaskActivityType[],
    },
    taskTitle: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
  },
  {
    timestamps: true,
  },
);

taskActivitySchema.index({ userId: 1, createdAt: -1 });

const TaskActivityModel =
  (mongoose.models.TaskActivity as
    | mongoose.Model<TaskActivityModelFields>
    | undefined) ??
  mongoose.model<TaskActivityModelFields>("TaskActivity", taskActivitySchema);

export default TaskActivityModel;
