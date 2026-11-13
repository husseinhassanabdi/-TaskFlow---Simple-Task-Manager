import { NextResponse } from "next/server";
import mongoose from "mongoose";
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

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const tasks = await TaskModel.find({ userId: session.user.id })
      .select("-userId -__v")
      .lean();

    return NextResponse.json(
      tasks.map(({ _id, title, description, category, dueDate, status, priority }) => ({
        id: _id.toString(),
        title,
        description,
        category,
        dueDate,
        status,
        priority,
      })),
    );
  } catch (error) {
    console.error(
      "Failed to retrieve tasks.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      { error: "Unable to retrieve tasks." },
      { status: 500 },
    );
  }
}

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

    if (!isTaskFormValues(body)) {
      return NextResponse.json({ error: "Invalid task details." }, { status: 400 });
    }

    await connectToDatabase();

    const task = await TaskModel.create({
      title: body.title,
      description: body.description,
      category: body.category,
      dueDate: body.dueDate,
      status: body.status,
      priority: body.priority,
      userId: session.user.id,
    });

    await recordTaskActivity({
      userId: session.user.id,
      taskId: task._id.toString(),
      type: "created",
      taskTitle: task.title,
    });

    return NextResponse.json(
      {
        id: task._id.toString(),
        title: task.title,
        description: task.description,
        category: task.category,
        dueDate: task.dueDate,
        status: task.status,
        priority: task.priority,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      return NextResponse.json({ error: "Invalid task details." }, { status: 400 });
    }

    console.error(
      "Failed to create task.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      { error: "Unable to create task." },
      { status: 500 },
    );
  }
}
