import type { GridFSBucketReadStream } from "mongodb";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  deleteTaskAttachment,
  openTaskAttachment,
  TaskAttachmentStorageError,
} from "@/lib/task-attachment-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; attachmentId: string }>;
};

function encodeFilename(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function getContentDisposition(filename: string, inline: boolean) {
  const fallback =
    filename
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\;]/g, "_")
      .trim() || "attachment";

  return `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encodeFilename(filename)}`;
}

function toWebReadableStream(
  nodeStream: GridFSBucketReadStream,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.once("end", () => controller.close());
      nodeStream.once("error", (error: Error) => controller.error(error));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

function getErrorResponse(error: unknown) {
  if (!(error instanceof TaskAttachmentStorageError)) return null;

  if (error.code === "invalid-input") {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error.code === "not-found") {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  return NextResponse.json(
    { error: "Unable to access the attachment." },
    { status: 500 },
  );
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id, attachmentId } = await params;
    if (!mongoose.isObjectIdOrHexString(id)) {
      return NextResponse.json({ error: "Invalid task ID." }, { status: 400 });
    }
    if (!mongoose.isObjectIdOrHexString(attachmentId)) {
      return NextResponse.json(
        { error: "Invalid attachment ID." },
        { status: 400 },
      );
    }

    const result = await openTaskAttachment(id, session.user.id, attachmentId);
    if (!result) {
      return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    }

    const isImage = [
      "image/png",
      "image/jpeg",
      "image/webp",
    ].includes(result.attachment.contentType);
    const wantsInline = new URL(request.url).searchParams.get("disposition") === "inline";
    const inline = isImage && wantsInline;
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Disposition": getContentDisposition(
        result.attachment.originalFilename,
        inline,
      ),
      "Content-Length": String(result.attachment.sizeBytes),
      "Content-Type": result.attachment.contentType,
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });

    return new Response(toWebReadableStream(result.stream), { headers });
  } catch (error) {
    const errorResponse = getErrorResponse(error);
    if (errorResponse) return errorResponse;

    console.error(
      "Failed to serve task attachment.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      { error: "Unable to retrieve the attachment." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id, attachmentId } = await params;
    if (!mongoose.isObjectIdOrHexString(id)) {
      return NextResponse.json({ error: "Invalid task ID." }, { status: 400 });
    }
    if (!mongoose.isObjectIdOrHexString(attachmentId)) {
      return NextResponse.json(
        { error: "Invalid attachment ID." },
        { status: 400 },
      );
    }

    const deleted = await deleteTaskAttachment(
      id,
      session.user.id,
      attachmentId,
    );
    if (!deleted) {
      return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    }

    return NextResponse.json(
      { message: "Attachment deleted successfully." },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const errorResponse = getErrorResponse(error);
    if (errorResponse) return errorResponse;

    console.error(
      "Failed to delete task attachment.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return NextResponse.json(
      { error: "Unable to delete the attachment." },
      { status: 500 },
    );
  }
}
