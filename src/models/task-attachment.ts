import "server-only";

import mongoose from "mongoose";

export const TASK_ATTACHMENT_LIMITS = {
  maxFileSizeBytes: 5 * 1024 * 1024,
  maxAttachmentsPerTask: 5,
  maxTotalSizePerTaskBytes: 25 * 1024 * 1024,
} as const;

export const TASK_ATTACHMENT_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
] as const;

export type TaskAttachmentContentType =
  (typeof TASK_ATTACHMENT_CONTENT_TYPES)[number];

type TaskAttachmentModelFields = {
  taskId: mongoose.Types.ObjectId;
  ownerId: string;
  originalFilename: string;
  contentType: TaskAttachmentContentType;
  sizeBytes: number;
  gridFsFileId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

const taskAttachmentSchema = new mongoose.Schema<TaskAttachmentModelFields>(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Task",
    },
    ownerId: {
      type: String,
      required: true,
      maxlength: 128,
    },
    originalFilename: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: 255,
    },
    contentType: {
      type: String,
      required: true,
      enum: TASK_ATTACHMENT_CONTENT_TYPES,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 1,
      max: TASK_ATTACHMENT_LIMITS.maxFileSizeBytes,
      validate: {
        validator: Number.isSafeInteger,
        message: "Attachment size must be a whole number of bytes.",
      },
    },
    gridFsFileId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
  },
  {
    timestamps: true,
  },
);

taskAttachmentSchema.index({ ownerId: 1, taskId: 1, createdAt: 1 });

const TaskAttachmentModel =
  (mongoose.models.TaskAttachment as
    | mongoose.Model<TaskAttachmentModelFields>
    | undefined) ??
  mongoose.model<TaskAttachmentModelFields>(
    "TaskAttachment",
    taskAttachmentSchema,
  );

export default TaskAttachmentModel;
