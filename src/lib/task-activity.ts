import "server-only";

import mongoose from "mongoose";
import TaskActivityModel from "@/models/task-activity";
import type { TaskActivityType } from "@/types/activity";

const activityTypes: TaskActivityType[] = ["created", "updated", "completed", "deleted"];

type TaskActivityInput = {
  userId: string;
  taskId: string;
  type: TaskActivityType;
  taskTitle: string;
};

export async function recordTaskActivity(input: TaskActivityInput) {
  const taskTitle = input.taskTitle.trim();
  if (
    !input.userId.trim() ||
    input.userId.length > 128 ||
    !mongoose.isObjectIdOrHexString(input.taskId) ||
    !activityTypes.includes(input.type) ||
    !taskTitle ||
    taskTitle.length > 100
  ) {
    throw new TypeError("Invalid task activity details.");
  }

  await TaskActivityModel.create({
    userId: input.userId,
    taskId: input.taskId,
    type: input.type,
    taskTitle,
  });
}
