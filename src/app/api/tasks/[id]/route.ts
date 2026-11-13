import mongoose from "mongoose";
import { NextResponse } from "next/server";
import TaskModel from "@/models/task";
import { getSession } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import { recordTaskActivity } from "@/lib/task-activity";
import type {
  TaskCategory,
  TaskFormValues,
  TaskPriority,
  TaskStatus,
} from "@/types/task";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const categories: TaskCategory[] = ["Design", "Marketing", "Work", "Personal"];
const statuses: TaskStatus[] = ["Pending", "In Progress", "Completed"];
const priorities: TaskPriority[] = ["High", "Medium", "Low"];

function isTaskFormValues(value: unknown): value is TaskFormValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const task = value as Record<string, unknown>;
  return (
    typeof task.title === "string" &&
    task.title.trim().length > 0 &&
    task.title.trim().length <= 100 &&
    typeof task.description === "string" &&
    task.description.trim().length > 0 &&
    task.description.trim().length <= 300 &&
    typeof task.category === "string" &&
    categories.includes(task.category as TaskCategory) &&
    typeof task.dueDate === "string" &&
    task.dueDate.trim().length > 0 &&
    typeof task.status === "string" &&
    statuses.includes(task.status as TaskStatus) &&
    typeof task.priority === "string" &&
    priorities.includes(task.priority as TaskPriority)
  );
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!mongoose.isObjectIdOrHexString(id)) {
      return NextResponse.json({ error: "Invalid task ID." }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (!isTaskFormValues(body)) {
      return NextResponse.json({ error: "Invalid task details." }, { status: 400 });
    }

    await connectToDatabase();

    const existingTask = await TaskModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      userId: session.user.id,
    })
      .select("status")
      .lean();

    if (!existingTask) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    const task = await TaskModel.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(id), userId: session.user.id },
      {
        $set: {
          title: body.title,
          description: body.description,
          category: body.category,
          dueDate: body.dueDate,
          status: body.status,
          priority: body.priority,
        },
      },
      { new: true, runValidators: true },
    ).select("-userId -__v");

    if (!task) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    await recordTaskActivity({
      userId: session.user.id,
      taskId: task._id.toString(),
      type: body.status === "Completed" && existingTask.status !== "Completed"
        ? "completed"
        : "updated",
      taskTitle: task.title,
    });

    return NextResponse.json({
      id: task._id.toString(),
      title: task.title,
      description: task.description,
      category: task.category,
      dueDate: task.dueDate,
      status: task.status,
      priority: task.priority,
    });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      return NextResponse.json({ error: "Invalid task details." }, { status: 400 });
    }

    console.error(
      "Failed to update task.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      { error: "Unable to update task." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!mongoose.isObjectIdOrHexString(id)) {
      return NextResponse.json({ error: "Invalid task ID." }, { status: 400 });
    }

    await connectToDatabase();

    const task = await TaskModel.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(id),
      userId: session.user.id,
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    await recordTaskActivity({
      userId: session.user.id,
      taskId: task._id.toString(),
      type: "deleted",
      taskTitle: task.title,
    });

    return NextResponse.json({ message: "Task deleted successfully." });
  } catch (error) {
    console.error(
      "Failed to delete task.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      { error: "Unable to delete task." },
      { status: 500 },
    );
  }
}
