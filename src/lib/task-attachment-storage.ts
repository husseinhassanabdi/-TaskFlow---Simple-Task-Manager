import "server-only";

import { GridFSBucket, type GridFSBucketReadStream } from "mongodb";
import mongoose from "mongoose";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import connectToDatabase from "@/lib/mongodb";
import TaskModel from "@/models/task";
import TaskAttachmentModel, {
  TASK_ATTACHMENT_LIMITS,
  TASK_ATTACHMENT_CONTENT_TYPES,
  type TaskAttachmentContentType,
} from "@/models/task-attachment";

const GRID_FS_BUCKET_NAME = "taskAttachments";

export type TaskAttachmentStorageErrorCode =
  | "invalid-input"
  | "file-too-large"
  | "task-limit-exceeded"
  | "unsupported-file-type"
  | "not-found";

export class TaskAttachmentStorageError extends Error {
  constructor(
    public readonly code: TaskAttachmentStorageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TaskAttachmentStorageError";
  }
}

export type TaskAttachmentInfo = {
  id: string;
  taskId: string;
  ownerId: string;
  originalFilename: string;
  contentType: TaskAttachmentContentType;
  sizeBytes: number;
  createdAt: Date;
};

type SaveTaskAttachmentInput = {
  taskId: string;
  ownerId: string;
  originalFilename: string;
  content: Buffer;
};

function assertTaskAndOwner(taskId: string, ownerId: string) {
  if (
    !mongoose.isObjectIdOrHexString(taskId) ||
    typeof ownerId !== "string" ||
    ownerId.trim().length === 0 ||
    ownerId.length > 128
  ) {
    throw new TaskAttachmentStorageError(
      "invalid-input",
      "A valid task ID and owner ID are required.",
    );
  }
}

function getOriginalFilename(value: string) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 255 ||
    /[\\/\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new TaskAttachmentStorageError(
      "invalid-input",
      "The attachment filename is invalid.",
    );
  }

  return value;
}

function hasSignature(content: Buffer, signature: number[]) {
  return (
    content.length >= signature.length &&
    signature.every((byte, index) => content[index] === byte)
  );
}

function getCsvColumnCount(line: string): number | null {
  let columnCount = 1;
  let insideQuotes = false;
  let atFieldStart = true;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (insideQuotes) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          index += 1;
        } else {
          insideQuotes = false;
        }
      }
      continue;
    }

    if (character === ",") {
      columnCount += 1;
      atFieldStart = true;
    } else if (character === '"') {
      if (!atFieldStart) return null;
      insideQuotes = true;
      atFieldStart = false;
    } else {
      atFieldStart = false;
    }
  }

  return insideQuotes ? null : columnCount;
}

function isCsvContent(text: string) {
  const rows = text.split(/\r?\n/).filter((row) => row.trim().length > 0);
  if (rows.length === 0) return false;

  let expectedColumns: number | null = null;
  for (const row of rows) {
    const columnCount = getCsvColumnCount(row);
    if (columnCount === null || columnCount < 2) return false;
    if (expectedColumns !== null && columnCount !== expectedColumns) return false;
    expectedColumns = columnCount;
  }

  return true;
}

function detectContentType(
  originalFilename: string,
  content: Buffer,
): TaskAttachmentContentType {
  const extension = originalFilename.split(".").pop()?.toLowerCase();
  let detectedType: TaskAttachmentContentType | null = null;

  if (hasSignature(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    detectedType = "image/png";
  } else if (hasSignature(content, [0xff, 0xd8, 0xff])) {
    detectedType = "image/jpeg";
  } else if (
    content.length >= 12 &&
    content.toString("ascii", 0, 4) === "RIFF" &&
    content.toString("ascii", 8, 12) === "WEBP"
  ) {
    detectedType = "image/webp";
  } else if (content.toString("ascii", 0, 5) === "%PDF-") {
    detectedType = "application/pdf";
  } else {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(content);
    } catch {
      throw new TaskAttachmentStorageError(
        "unsupported-file-type",
        "The file content is not a supported format.",
      );
    }

    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
      throw new TaskAttachmentStorageError(
        "unsupported-file-type",
        "The file content is not a supported text format.",
      );
    }

    if (extension === "csv" && isCsvContent(text)) {
      detectedType = "text/csv";
    } else if (extension === "txt") {
      detectedType = "text/plain";
    }
  }

  const allowedExtensions: Record<TaskAttachmentContentType, string[]> = {
    "image/png": ["png"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/webp": ["webp"],
    "application/pdf": ["pdf"],
    "text/plain": ["txt"],
    "text/csv": ["csv"],
  };

  if (!detectedType || !allowedExtensions[detectedType].includes(extension ?? "")) {
    throw new TaskAttachmentStorageError(
      "unsupported-file-type",
      "Only verified PNG, JPEG, WebP, PDF, TXT, and CSV files are supported.",
    );
  }

  return detectedType;
}

async function getGridFsBucket() {
  await connectToDatabase();

  const database = mongoose.connection.db;
  if (!database) {
    throw new Error("MongoDB connected without an active database.");
  }

  return {
    database,
    bucket: new GridFSBucket(database, { bucketName: GRID_FS_BUCKET_NAME }),
  };
}

async function removeGridFsFile(
  database: NonNullable<typeof mongoose.connection.db>,
  fileId: mongoose.Types.ObjectId,
) {
  await Promise.all([
    database.collection(`${GRID_FS_BUCKET_NAME}.files`).deleteOne({ _id: fileId }),
    database
      .collection(`${GRID_FS_BUCKET_NAME}.chunks`)
      .deleteMany({ files_id: fileId }),
  ]);
}

function toTaskAttachmentInfo(attachment: {
  _id: mongoose.Types.ObjectId;
  taskId: mongoose.Types.ObjectId;
  ownerId: string;
  originalFilename: string;
  contentType: TaskAttachmentContentType;
  sizeBytes: number;
  createdAt: Date;
}): TaskAttachmentInfo {
  return {
    id: attachment._id.toString(),
    taskId: attachment.taskId.toString(),
    ownerId: attachment.ownerId,
    originalFilename: attachment.originalFilename,
    contentType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt,
  };
}

async function assertOwnedTask(taskId: string, ownerId: string) {
  await connectToDatabase();

  const taskObjectId = new mongoose.Types.ObjectId(taskId);
  const task = await TaskModel.findOne({ _id: taskObjectId, userId: ownerId })
    .select("_id")
    .lean();

  if (!task) {
    throw new TaskAttachmentStorageError(
      "not-found",
      "The task was not found.",
    );
  }

  return taskObjectId;
}

export async function saveTaskAttachment({
  taskId,
  ownerId,
  originalFilename: filenameInput,
  content,
}: SaveTaskAttachmentInput): Promise<TaskAttachmentInfo> {
  assertTaskAndOwner(taskId, ownerId);

  const originalFilename = getOriginalFilename(filenameInput);
  if (!Buffer.isBuffer(content) || content.length === 0) {
    throw new TaskAttachmentStorageError(
      "invalid-input",
      "A non-empty file is required.",
    );
  }
  if (content.length > TASK_ATTACHMENT_LIMITS.maxFileSizeBytes) {
    throw new TaskAttachmentStorageError(
      "file-too-large",
      "Attachments cannot be larger than 5 MB.",
    );
  }

  const contentType = detectContentType(originalFilename, content);
  const taskObjectId = await assertOwnedTask(taskId, ownerId);
  const existingAttachments = await TaskAttachmentModel.find({
    taskId: taskObjectId,
    ownerId,
  })
    .select("sizeBytes")
    .lean();
  const currentTotalSize = existingAttachments.reduce(
    (total, attachment) => total + attachment.sizeBytes,
    0,
  );

  if (
    existingAttachments.length >= TASK_ATTACHMENT_LIMITS.maxAttachmentsPerTask ||
    currentTotalSize + content.length >
      TASK_ATTACHMENT_LIMITS.maxTotalSizePerTaskBytes
  ) {
    throw new TaskAttachmentStorageError(
      "task-limit-exceeded",
      "This task has reached its attachment count or storage limit.",
    );
  }

  const { database, bucket } = await getGridFsBucket();
  const gridFsFileId = new mongoose.Types.ObjectId();
  const uploadStream = bucket.openUploadStreamWithId(
    gridFsFileId,
    originalFilename,
    {
      metadata: { taskId, ownerId, contentType },
    },
  );

  try {
    await pipeline(Readable.from([content]), uploadStream);
  } catch (error) {
    try {
      await removeGridFsFile(database, gridFsFileId);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "GridFS upload failed and its partial data could not be fully removed.",
      );
    }
    throw error;
  }

  try {
    const attachment = await TaskAttachmentModel.create({
      taskId: taskObjectId,
      ownerId,
      originalFilename,
      contentType,
      sizeBytes: content.length,
      gridFsFileId,
    });

    return toTaskAttachmentInfo(attachment);
  } catch (error) {
    try {
      await removeGridFsFile(database, gridFsFileId);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Attachment metadata creation failed and its GridFS file could not be fully removed.",
      );
    }
    throw error;
  }
}

export async function listTaskAttachments(
  taskId: string,
  ownerId: string,
): Promise<TaskAttachmentInfo[]> {
  assertTaskAndOwner(taskId, ownerId);
  await assertOwnedTask(taskId, ownerId);

  const attachments = await TaskAttachmentModel.find({
    taskId: new mongoose.Types.ObjectId(taskId),
    ownerId,
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  return attachments.map(toTaskAttachmentInfo);
}

export async function openTaskAttachment(
  taskId: string,
  ownerId: string,
  attachmentId: string,
): Promise<{ attachment: TaskAttachmentInfo; stream: GridFSBucketReadStream } | null> {
  assertTaskAndOwner(taskId, ownerId);
  await assertOwnedTask(taskId, ownerId);
  if (!mongoose.isObjectIdOrHexString(attachmentId)) {
    return null;
  }

  const attachment = await TaskAttachmentModel.findOne({
    _id: new mongoose.Types.ObjectId(attachmentId),
    taskId: new mongoose.Types.ObjectId(taskId),
    ownerId,
  }).lean();
  if (!attachment) return null;

  const { bucket } = await getGridFsBucket();
  return {
    attachment: toTaskAttachmentInfo(attachment),
    stream: bucket.openDownloadStream(attachment.gridFsFileId),
  };
}

export async function deleteTaskAttachment(
  taskId: string,
  ownerId: string,
  attachmentId: string,
): Promise<boolean> {
  assertTaskAndOwner(taskId, ownerId);
  await assertOwnedTask(taskId, ownerId);
  if (!mongoose.isObjectIdOrHexString(attachmentId)) return false;

  const attachment = await TaskAttachmentModel.findOne({
    _id: new mongoose.Types.ObjectId(attachmentId),
    taskId: new mongoose.Types.ObjectId(taskId),
    ownerId,
  }).lean();
  if (!attachment) return false;

  const { bucket } = await getGridFsBucket();
  await bucket.delete(attachment.gridFsFileId);

  const result = await TaskAttachmentModel.deleteOne({
    _id: attachment._id,
    taskId: attachment.taskId,
    ownerId,
  });
  if (result.deletedCount !== 1) {
    throw new Error("GridFS file was removed but attachment metadata was not.");
  }

  return true;
}

export async function deleteTaskAttachments(
  taskId: string,
  ownerId: string,
): Promise<number> {
  assertTaskAndOwner(taskId, ownerId);

  const taskObjectId = new mongoose.Types.ObjectId(taskId);
  const attachments = await TaskAttachmentModel.find({ taskId: taskObjectId, ownerId })
    .select("_id gridFsFileId")
    .lean();
  if (attachments.length === 0) return 0;

  const { bucket } = await getGridFsBucket();
  let deletedCount = 0;
  for (const attachment of attachments) {
    await bucket.delete(attachment.gridFsFileId);
    const result = await TaskAttachmentModel.deleteOne({
      _id: attachment._id,
      taskId: taskObjectId,
      ownerId,
    });
    if (result.deletedCount !== 1) {
      throw new Error("GridFS file was removed but attachment metadata was not.");
    }
    deletedCount += 1;
  }

  return deletedCount;
}

export { TASK_ATTACHMENT_CONTENT_TYPES };
