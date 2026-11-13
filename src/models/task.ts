import "server-only";

import mongoose from "mongoose";
import type { TaskCategory, TaskFormValues, TaskPriority, TaskStatus } from "@/types/task";

type TaskModelFields = TaskFormValues & {
  userId: string;
};

const taskSchema = new mongoose.Schema<TaskModelFields>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    category: {
      type: String,
      required: true,
      enum: ["Design", "Marketing", "Work", "Personal"] satisfies TaskCategory[],
    },
    dueDate: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["Pending", "In Progress", "Completed"] satisfies TaskStatus[],
    },
    priority: {
      type: String,
      required: true,
      enum: ["High", "Medium", "Low"] satisfies TaskPriority[],
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

const TaskModel =
  (mongoose.models.Task as mongoose.Model<TaskModelFields> | undefined) ??
  mongoose.model<TaskModelFields>("Task", taskSchema);

export default TaskModel;
