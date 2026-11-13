import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  listTaskAttachments,
  saveTaskAttachment,
  TaskAttachmentStorageError,
} from "@/lib/task-attachment-storage";
import connectToDatabase from "@/lib/mongodb";
import TaskModel from "@/models/task";
import { TASK_ATTACHMENT_LIMITS } from "@/models/task-attachment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_MULTIPART_BODY_BYTES =
  TASK_ATTACHMENT_LIMITS.maxFileSizeBytes + MAX_MULTIPART_OVERHEAD_BYTES;

function getErrorResponse(error: unknown) {
  if (!(error instanceof TaskAttachmentStorageError)) {
    return null;
  }

  switch (error.code) {
    case "invalid-input":
      return NextResponse.json({ error: error.message }, { status: 400 });
    case "file-too-large":
      return NextResponse.json({ error: error.message }, { status: 413 });
    case "task-limit-exceeded":
      return NextResponse.json({ error: error.message }, { status: 409 });
    case "unsupported-file-type":
      return NextResponse.json({ error: error.message }, { status: 415 });
    case "not-found":
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
}

class UploadRequestTooLargeError extends Error {}

async function parseBoundedFormData(request: Request): Promise<FormData> {
  const reader = request.body?.getReader();
  if (!reader) {
    throw new Error("The multipart request body is missing.");
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_MULTIPART_BODY_BYTES) {
        await reader.cancel();
        throw new UploadRequestTooLargeError();
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  const bodyBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Request(request.url, {
    method: "POST",
    headers,
    body: new Blob([bodyBytes.buffer]),
  }).formData();
}

function toAttachmentResponse(attachment: Awaited<ReturnType<typeof listTaskAttachments>>[number]) {
  return {
    id: attachment.id,
    taskId: attachment.taskId,
    originalFilename: attachment.originalFilename,
    contentType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt.toISOString(),
  };
}

async function getOwnedTaskId(id: string, userId: string) {
  if (!mongoose.isObjectIdOrHexString(id)) return null;

  await connectToDatabase();
  const task = await TaskModel.findOne({
    _id: new mongoose.Types.ObjectId(id),
    userId,
  })
    .select("_id")
    .lean();

  return task ? task._id.toString() : null;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await params;
    const taskId = await getOwnedTaskId(id, session.user.id);
    if (!taskId) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    const attachments = await listTaskAttachments(taskId, session.user.id);
    return NextResponse.json(attachments.map(toAttachmentResponse), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error(
      "Failed to list task attachments.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      { error: "Unable to retrieve task attachments." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await params;
    const taskId = await getOwnedTaskId(id, session.user.id);
    if (!taskId) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
      return NextResponse.json(
        { error: "Upload must use multipart/form-data." },
        { status: 415 },
      );
    }

    const contentLengthHeader = request.headers.get("content-length");
    if (
      contentLengthHeader !== null &&
      !/^\d+$/.test(contentLengthHeader)
    ) {
      return NextResponse.json(
        { error: "Invalid Content-Length header." },
        { status: 400 },
      );
    }
    if (contentLengthHeader !== null && Number(contentLengthHeader) > MAX_MULTIPART_BODY_BYTES) {
      return NextResponse.json(
        { error: "Attachments cannot be larger than 5 MiB." },
        { status: 413 },
      );
    }

    let formData: FormData;
    try {
      formData = await parseBoundedFormData(request);
    } catch (error) {
      if (error instanceof UploadRequestTooLargeError) {
        return NextResponse.json(
          { error: "Attachments cannot be larger than 5 MiB." },
          { status: 413 },
        );
      }
      return NextResponse.json(
        { error: "Invalid multipart upload." },
        { status: 400 },
      );
    }

    const entries = [...formData.entries()];
    if (
      entries.length !== 1 ||
      entries[0][0] !== "file" ||
      !(entries[0][1] instanceof File)
    ) {
      return NextResponse.json(
        { error: "Provide exactly one file in the 'file' field." },
        { status: 400 },
      );
    }

    const file = entries[0][1];
    if (file.size > TASK_ATTACHMENT_LIMITS.maxFileSizeBytes) {
      return NextResponse.json(
        { error: "Attachments cannot be larger than 5 MiB." },
        { status: 413 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json(
        { error: "The attachment cannot be empty." },
        { status: 400 },
      );
    }

    const attachment = await saveTaskAttachment({
      taskId,
      ownerId: session.user.id,
      originalFilename: file.name,
      content: Buffer.from(await file.arrayBuffer()),
    });

    return NextResponse.json(toAttachmentResponse(attachment), {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const errorResponse = getErrorResponse(error);
    if (errorResponse) return errorResponse;

    console.error(
      "Failed to upload task attachment.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      { error: "Unable to upload the attachment." },
      { status: 500 },
    );
  }
}
