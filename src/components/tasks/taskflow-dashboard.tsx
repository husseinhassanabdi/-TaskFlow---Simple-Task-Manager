"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import type { TaskActivity, TaskActivityType } from "@/types/activity";
import type { Task, TaskCategory, TaskFormValues, TaskPriority, TaskStatus } from "@/types/task";
import { authClient } from "@/lib/auth-client";
import AdminNavigation from "@/components/admin/admin-navigation";

export type DashboardView = "overview" | "tasks" | "upcoming" | "completed" | "settings";

const statusOptions: TaskStatus[] = ["Pending", "In Progress", "Completed"];
const filters = ["All tasks", "In progress", "To do", "Completed"] as const;
type TaskFilter = (typeof filters)[number];
type TaskAttachment = {
  id: string;
  taskId: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};
const activityVerbs: Record<TaskActivityType, string> = {
  created: "Created",
  updated: "Updated",
  completed: "Completed",
  deleted: "Deleted",
};

function getTimeGreeting(): "morning" | "afternoon" | "evening" {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function isTask(value: unknown): value is Task {
  if (typeof value !== "object" || value === null) return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    typeof task.description === "string" &&
    ["Design", "Marketing", "Work", "Personal"].includes(String(task.category)) &&
    typeof task.dueDate === "string" &&
    ["Pending", "In Progress", "Completed"].includes(String(task.status)) &&
    ["High", "Medium", "Low"].includes(String(task.priority))
  );
}

function isTaskActivity(value: unknown): value is TaskActivity {
  if (typeof value !== "object" || value === null) return false;
  const activity = value as Record<string, unknown>;
  return (
    typeof activity.id === "string" &&
    ["created", "updated", "completed", "deleted"].includes(String(activity.type)) &&
    typeof activity.taskTitle === "string" &&
    typeof activity.createdAt === "string" &&
    !Number.isNaN(Date.parse(activity.createdAt))
  );
}

function isTaskAttachment(value: unknown): value is TaskAttachment {
  if (typeof value !== "object" || value === null) return false;
  const attachment = value as Record<string, unknown>;
  return (
    typeof attachment.id === "string" &&
    typeof attachment.taskId === "string" &&
    typeof attachment.originalFilename === "string" &&
    typeof attachment.contentType === "string" &&
    typeof attachment.sizeBytes === "number" &&
    typeof attachment.createdAt === "string"
  );
}

function isImageAttachment(attachment: TaskAttachment) {
  return ["image/png", "image/jpeg", "image/webp"].includes(attachment.contentType);
}

function formatAttachmentSize(sizeBytes: number) {
  return sizeBytes < 1024 * 1024
    ? `${Math.max(1, Math.round(sizeBytes / 1024))} KB`
    : `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function areTasksEquivalent(first: Task, second: Task) {
  return (
    first.id === second.id &&
    first.title === second.title &&
    first.description === second.description &&
    first.category === second.category &&
    first.dueDate === second.dueDate &&
    first.status === second.status &&
    first.priority === second.priority
  );
}

function areTasksEqual(currentTasks: Task[], nextTasks: Task[]) {
  return (
    currentTasks.length === nextTasks.length &&
    currentTasks.every((task, index) => areTasksEquivalent(task, nextTasks[index]))
  );
}

function getChangedTaskIds(currentTasks: Task[], nextTasks: Task[]) {
  const currentById = new Map(currentTasks.map((task) => [task.id, task]));
  return nextTasks
    .filter((task) => {
      const currentTask = currentById.get(task.id);
      return !currentTask || !areTasksEquivalent(currentTask, task);
    })
    .map((task) => task.id);
}

async function fetchTasks(signal: AbortSignal): Promise<Task[]> {
  const response = await fetch("/api/tasks", { cache: "no-store", signal });
  if (!response.ok) {
    throw new Error(await getApiError(response, "Unable to refresh your tasks."));
  }
  const result: unknown = await response.json();
  if (!Array.isArray(result) || !result.every(isTask)) {
    throw new Error("The task service returned invalid task data.");
  }
  return result;
}

async function fetchTaskActivities(signal: AbortSignal): Promise<TaskActivity[]> {
  const response = await fetch("/api/activity", { cache: "no-store", signal });
  if (!response.ok) {
    throw new Error(await getApiError(response, "Unable to refresh recent activity."));
  }
  const result: unknown = await response.json();
  if (!Array.isArray(result) || !result.every(isTaskActivity)) {
    throw new Error("The activity service returned invalid data.");
  }
  return result;
}

async function getApiError(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => null);
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return fallback;
}

function SyncIndicator({
  status,
  label,
  lastSyncLabel,
  error,
}: {
  status: "syncing" | "error" | "synced";
  label: string;
  lastSyncLabel: string;
  error: string;
}) {
  return (
    <div
      className={`sync-indicator sync-indicator-${status}`}
      role="status"
      aria-label={`${label}. ${lastSyncLabel}.`}
      title={error || undefined}
    >
      <span className="sync-indicator-dot" aria-hidden="true" />
      <span className="sync-indicator-copy">
        <strong>{label}</strong>
        <small>{lastSyncLabel}</small>
      </span>
    </div>
  );
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function Icon({
  name,
  size = 18,
}: {
  name: string;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "grid":
      return <svg {...common}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>;
    case "check":
      return <svg {...common}><path d="m5 12.5 4.2 4.2L19.5 6.8" /></svg>;
    case "calendar":
      return <svg {...common}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17" /></svg>;
    case "chart":
      return <svg {...common}><path d="M4 19.5h16M6.5 16V10M12 16V5M17.5 16v-4" /></svg>;
    case "settings":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.1.9-1.1 1.9-1.3-.5a7.9 7.9 0 0 1-1.5.9l-.2 1.4h-2.2l-.3-1.4a7.9 7.9 0 0 1-1.6-.6l-1.2.7-1.6-1.6.7-1.2a7.9 7.9 0 0 1-.6-1.6l-1.4-.3v-2.2l1.4-.3a7.9 7.9 0 0 1 .6-1.6l-.7-1.2 1.6-1.6 1.2.7a7.9 7.9 0 0 1 1.6-.6l.3-1.4h2.2l.3 1.4a7.9 7.9 0 0 1 1.5.9l1.3-.5 1.1 1.9-1.1.9a7.9 7.9 0 0 1 0 1.8l1.1.9-1.1 1.9-1.3-.5a7.9 7.9 0 0 1-1.5.9" /></svg>;
    case "users":
      return <svg {...common}><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="7.5" r="3.5" /><path d="M17 11a3 3 0 1 0 0-6m3 15v-1.5a3.5 3.5 0 0 0-2.5-3.35" /></svg>;
    case "search":
      return <svg {...common}><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.3 4.3" /></svg>;
    case "plus":
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "arrow":
      return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case "sparkle":
      return <svg {...common}><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></svg>;
    case "clock":
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 2" /></svg>;
    case "dots":
      return <svg {...common}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
    case "trash":
      return <svg {...common}><path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3" /></svg>;
    case "upload":
      return <svg {...common}><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>;
    case "download":
      return <svg {...common}><path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>;
    case "file":
      return <svg {...common}><path d="M7 3.5h7l4.5 4.5v12a.5.5 0 0 1-.5.5H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" /><path d="M14 3.5V8h4.5M9 13h6m-6 3h6" /></svg>;
    case "image":
      return <svg {...common}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m5 17 4.5-4 3.5 3 2.5-2 3.5 3" /></svg>;
    case "bell":
      return <svg {...common}><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
    case "sun":
      return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>;
    default:
      return null;
  }
}

function formatDueDate(date: string) {
  const dueDate = new Date(`${date}T12:00:00`);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDueDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const dayDifference = Math.round(
    (startOfDueDate.getTime() - startOfToday.getTime()) / 86_400_000,
  );

  if (dayDifference === 0) return "Today";
  if (dayDifference === 1) return "Tomorrow";
  return dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getTodayLabel() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function TaskDialog({
  task,
  onClose,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
  userId,
}: {
  task: Task | null;
  onClose: () => void;
  onSave: (task: TaskFormValues) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  isSaving: boolean;
  isDeleting: boolean;
  userId: string | null;
}) {
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentOperation, setAttachmentOperation] = useState<"uploading" | "removing" | null>(null);
  const [attachmentMessage, setAttachmentMessage] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const [isAttachmentDragOver, setIsAttachmentDragOver] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const attachmentBusy = attachmentOperation !== null;

  const refreshAttachments = useCallback(async (signal?: AbortSignal) => {
    if (!task) return;

    const response = await fetch(`/api/tasks/${task.id}/attachments`, {
      cache: "no-store",
      signal,
    });
    if (!response.ok) {
      throw new Error(await getApiError(response, "Unable to load attachments."));
    }

    const result: unknown = await response.json();
    if (!Array.isArray(result) || !result.every(isTaskAttachment)) {
      throw new Error("The attachment service returned invalid data.");
    }
    setAttachments(result);
  }, [task]);

  useEffect(() => {
    if (!task) {
      setAttachments([]);
      setAttachmentsLoading(false);
      setAttachmentError("");
      setAttachmentMessage("");
      return;
    }

    const controller = new AbortController();
    setAttachments([]);
    setAttachmentsLoading(true);
    setAttachmentError("");
    setAttachmentMessage("");
    void refreshAttachments(controller.signal)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAttachmentError(
          error instanceof Error ? error.message : "Unable to load attachments.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setAttachmentsLoading(false);
      });

    return () => controller.abort();
  }, [refreshAttachments, task, userId]);

  async function uploadAttachment(file: File) {
    if (!task) return;

    setAttachmentOperation("uploading");
    setAttachmentError("");
    setAttachmentMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/tasks/${task.id}/attachments`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await getApiError(response, "Unable to upload the attachment."));
      }

      await refreshAttachments();
      setAttachmentMessage(`${file.name} uploaded.`);
    } catch (error) {
      console.error("Task attachment upload failed.", error);
      setAttachmentError(
        error instanceof Error ? error.message : "Unable to upload the attachment.",
      );
    } finally {
      setAttachmentOperation(null);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  }

  function handleAttachmentDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsAttachmentDragOver(false);
    if (attachmentBusy || attachmentsLoading || attachments.length >= 5) return;

    const file = event.dataTransfer.files[0];
    if (file) void uploadAttachment(file);
  }

  async function removeAttachment(attachment: TaskAttachment) {
    if (!task || !window.confirm(`Remove "${attachment.originalFilename}"?`)) return;

    setAttachmentOperation("removing");
    setAttachmentError("");
    setAttachmentMessage("");
    try {
      const response = await fetch(
        `/api/tasks/${task.id}/attachments/${attachment.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error(await getApiError(response, "Unable to remove the attachment."));
      }

      await refreshAttachments();
      setAttachmentMessage(`${attachment.originalFilename} removed.`);
    } catch (error) {
      console.error("Task attachment removal failed.", error);
      setAttachmentError(
        error instanceof Error ? error.message : "Unable to remove the attachment.",
      );
    } finally {
      setAttachmentOperation(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await onSave({
      title: String(formData.get("title")).trim(),
      description: String(formData.get("description")).trim(),
      category: String(formData.get("category")) as TaskCategory,
      dueDate: String(formData.get("dueDate")),
      status: String(formData.get("status")) as TaskStatus,
      priority: String(formData.get("priority")) as TaskPriority,
    });
  }

  return (
    <div className="dialog-backdrop">
      <section className="task-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h2 id="dialog-title">{task ? "Edit task" : "Create a task"}</h2>
          </div>
          <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close dialog" disabled={isSaving || isDeleting}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="task-form">
          <label>
            Task name
            <input name="title" defaultValue={task?.title} placeholder="What needs to get done?" required maxLength={100} autoFocus />
          </label>
          <label>
            Description
            <textarea name="description" defaultValue={task?.description} placeholder="Add a few details..." rows={3} maxLength={300} required />
          </label>
          <div className="form-row">
            <label>
              Category
              <select name="category" defaultValue={task?.category ?? "Work"}>
                <option>Work</option>
                <option>Design</option>
                <option>Marketing</option>
                <option>Personal</option>
              </select>
            </label>
            <label>
              Due date
              <input name="dueDate" type="date" defaultValue={task?.dueDate ?? getLocalDateString()} required />
            </label>
          </div>
          <div className="form-row">
            <label>
              Status
              <select name="status" defaultValue={task?.status ?? "Pending"}>
                {statusOptions.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label>
              Priority
              <select name="priority" defaultValue={task?.priority ?? "Medium"}>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </label>
          </div>
          <section className="task-attachments" aria-labelledby="task-attachments-title">
            <div className="task-attachments-heading">
              <div>
                <h3 id="task-attachments-title">Attachments</h3>
                <p>Files for this task, kept private to your account.</p>
              </div>
              {task && (
                <span className="task-attachment-count">
                  {attachments.length}/5
                </span>
              )}
            </div>

            {!task ? (
              <p className="task-attachments-note">
                Save this task first to add attachments.
              </p>
            ) : (
              <>
                <div
                  className={`task-attachment-dropzone${isAttachmentDragOver ? " is-drag-over" : ""}${attachmentBusy || attachmentsLoading || attachments.length >= 5 ? " is-disabled" : ""}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (!attachmentBusy && !attachmentsLoading && attachments.length < 5) {
                      setIsAttachmentDragOver(true);
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!attachmentBusy && !attachmentsLoading && attachments.length < 5) {
                      setIsAttachmentDragOver(true);
                    }
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setIsAttachmentDragOver(false);
                    }
                  }}
                  onDrop={handleAttachmentDrop}
                  aria-busy={attachmentOperation === "uploading"}
                >
                  <input
                    ref={attachmentInputRef}
                    className="task-attachment-input"
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,image/png,image/jpeg,image/webp,application/pdf,text/plain,text/csv"
                    disabled={
                      attachmentBusy ||
                      attachmentsLoading ||
                      attachments.length >= 5
                    }
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) void uploadAttachment(file);
                    }}
                    aria-label="Choose an attachment to upload"
                  />
                  {attachmentOperation === "uploading" ? (
                    <div className="task-attachment-uploading" role="status" aria-live="polite">
                      <span className="task-attachment-upload-icon is-uploading">
                        <Icon name="upload" size={18} />
                      </span>
                      <span>
                        <strong>Uploading file…</strong>
                        <small>Keep this window open while it finishes.</small>
                      </span>
                    </div>
                  ) : attachmentOperation === "removing" ? (
                    <div className="task-attachment-uploading" role="status" aria-live="polite">
                      <span className="task-attachment-upload-icon">
                        <Icon name="trash" size={17} />
                      </span>
                      <span>
                        <strong>Removing attachment…</strong>
                        <small>Your file is being removed securely.</small>
                      </span>
                    </div>
                  ) : (
                    <>
                      <span className="task-attachment-upload-icon">
                        <Icon name="upload" size={19} />
                      </span>
                      <strong className="task-attachment-drop-title">
                        Drop a file here
                      </strong>
                      <span className="task-attachment-drop-copy">
                        or choose a file from your device
                      </span>
                      <button
                        type="button"
                        className="task-attachment-browse"
                        onClick={() => attachmentInputRef.current?.click()}
                        disabled={
                          attachmentBusy ||
                          attachmentsLoading ||
                          attachments.length >= 5
                        }
                      >
                        Browse files
                      </button>
                    </>
                  )}
                  <small className="task-attachment-helper">
                    PNG, JPG, WebP, PDF, TXT, CSV · Up to 5 MiB per file
                  </small>
                </div>

                {attachmentsLoading ? (
                  <div className="task-attachment-loading" role="status">
                    <span className="task-attachment-loading-mark" aria-hidden="true" />
                    <span>Loading your attachments…</span>
                  </div>
                ) : attachments.length === 0 ? (
                  <div className="task-attachment-empty">
                    <span className="task-attachment-empty-icon" aria-hidden="true">
                      <Icon name="file" size={19} />
                    </span>
                    <span>
                      <strong>No attachments yet</strong>
                      <small>Add a file to keep useful references with this task.</small>
                    </span>
                  </div>
                ) : (
                  <ul className="task-attachment-list">
                    {attachments.map((attachment) => (
                      <li className="task-attachment-item" key={attachment.id}>
                        {isImageAttachment(attachment) ? (
                          // Next Image optimization cannot authenticate this private preview request.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="task-attachment-preview"
                            src={`/api/tasks/${task.id}/attachments/${attachment.id}?disposition=inline`}
                            alt={`Preview of ${attachment.originalFilename}`}
                          />
                        ) : (
                          <span
                            className={`task-attachment-file-icon ${attachment.contentType === "application/pdf" ? "is-pdf" : attachment.contentType === "text/csv" ? "is-csv" : "is-text"}`}
                            aria-hidden="true"
                          >
                            <Icon name="file" size={18} />
                            <small>
                              {attachment.contentType === "application/pdf"
                                ? "PDF"
                                : attachment.contentType === "text/csv"
                                  ? "CSV"
                                  : "TXT"}
                            </small>
                          </span>
                        )}
                        <span className="task-attachment-details">
                          <strong title={attachment.originalFilename}>
                            {attachment.originalFilename}
                          </strong>
                          <small>
                            {formatAttachmentSize(attachment.sizeBytes)} · {attachment.contentType.split("/")[1].toUpperCase()}
                          </small>
                        </span>
                        <a
                          className="task-attachment-action task-attachment-download"
                          href={`/api/tasks/${task.id}/attachments/${attachment.id}`}
                          download={attachment.originalFilename}
                          aria-label={`Download ${attachment.originalFilename}`}
                          title="Download file"
                        >
                          <Icon name="download" size={16} />
                        </a>
                        <button
                          type="button"
                          className="task-attachment-action task-attachment-remove"
                          onClick={() => void removeAttachment(attachment)}
                          disabled={attachmentBusy}
                          aria-label={`Remove ${attachment.originalFilename}`}
                          title="Delete attachment"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <p className="task-attachments-limits">
              Maximum 5 attachments and 25 MiB combined per task.
            </p>
            {attachmentError && (
              <p className="task-attachment-feedback is-error" role="alert">
                {attachmentError}
              </p>
            )}
            {attachmentMessage && (
              <p className="task-attachment-feedback" role="status">
                {attachmentMessage}
              </p>
            )}
          </section>
          <div className="dialog-actions">
            {task && <button type="button" className="button button-delete" onClick={() => void onDelete(task.id)} disabled={isSaving || isDeleting}><Icon name="trash" size={15} /> {isDeleting ? "Deleting…" : "Delete task"}</button>}
            <button type="button" className="button button-quiet" onClick={onClose} disabled={isSaving || isDeleting}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={isSaving || isDeleting}>{isSaving ? "Saving…" : task ? "Save changes" : "Create task"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function TaskFlowDashboard({
  view = "overview",
}: {
  view?: DashboardView;
}) {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const userId = session?.user.id ?? null;
  const isAdmin = session?.user.role?.split(",").includes("admin") ?? false;
  const currentUserIdRef = useRef(userId);
  currentUserIdRef.current = userId;
  const [tasks, setTasks] = useState<Task[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const [highlightedTaskIds, setHighlightedTaskIds] = useState<Set<string>>(new Set());
  const highlightTimeoutsRef = useRef(new Map<string, number>());
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activityError, setActivityError] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("All tasks");
  const [query, setQuery] = useState("");
  const [dialogTask, setDialogTask] = useState<Task | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [timeGreeting, setTimeGreeting] = useState<"morning" | "afternoon" | "evening">("morning");
  const [selectedProject, setSelectedProject] = useState<TaskCategory | null>(null);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksLoadedForUser, setTasksLoadedForUser] = useState<string | null>(null);
  const [taskReloadKey, setTaskReloadKey] = useState(0);
  const [taskError, setTaskError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [isSyncing, setIsSyncing] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(new Set());
  const pendingTaskIdsRef = useRef(new Set<string>());
  const [isCreatingRequest, setIsCreatingRequest] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const profileName = session?.user.name || "Account";
  const greetingName = session?.user.name?.trim().split(/\s+/)[0] || "there";
  const profileEmail = session?.user.email || "";
  const profileInitials = profileName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const applyTasks = useCallback((nextTasks: Task[]) => {
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
  }, []);

  const highlightSyncedTasks = useCallback((taskIds: string[]) => {
    if (taskIds.length === 0) return;

    setHighlightedTaskIds((currentIds) => {
      const nextIds = new Set(currentIds);
      for (const taskId of taskIds) nextIds.add(taskId);
      return nextIds;
    });

    for (const taskId of taskIds) {
      const existingTimeout = highlightTimeoutsRef.current.get(taskId);
      if (existingTimeout !== undefined) window.clearTimeout(existingTimeout);
      const timeoutId = window.setTimeout(() => {
        setHighlightedTaskIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.delete(taskId);
          return nextIds;
        });
        highlightTimeoutsRef.current.delete(taskId);
      }, 1800);
      highlightTimeoutsRef.current.set(taskId, timeoutId);
    }
  }, []);

  async function handleLogout() {
    setIsLoggingOut(true);
    setLogoutError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setLogoutError(result.error.message || "Unable to sign out. Please try again.");
        return;
      }
      applyTasks([]);
      setActivities([]);
      setTasksLoadedForUser(null);
      router.replace("/login");
    } catch (error) {
      console.error("Logout request failed.", error);
      setLogoutError("Unable to reach the authentication service. Please try again.");
    } finally {
      setIsLoggingOut(false);
    }
  }

  useEffect(() => {
    setTimeGreeting(getTimeGreeting());
  }, []);

  useEffect(() => {
    if (sessionPending) return;
    for (const timeoutId of highlightTimeoutsRef.current.values()) {
      window.clearTimeout(timeoutId);
    }
    highlightTimeoutsRef.current.clear();
    setHighlightedTaskIds(new Set());

    if (!userId) {
      applyTasks([]);
      setActivities([]);
      setTasksLoadedForUser(null);
      setTasksLoading(false);
      setActivitiesLoading(false);
      setIsSyncing(false);
      setLastSyncedAt(null);
      setSyncError("");
      return;
    }

    const controller = new AbortController();
    let active = true;
    applyTasks([]);
    setActivities([]);
    setActivitiesLoading(true);
    setTasksLoadedForUser(null);
    setTasksLoading(true);
    setTaskError("");
    setActivityError("");
    setSyncError("");
    setIsSyncing(true);
    setLastSyncedAt(null);

    async function loadTasks() {
      const [taskResult, activityResult] = await Promise.allSettled([
        fetchTasks(controller.signal),
        fetchTaskActivities(controller.signal),
      ]);
      if (
        !active ||
        controller.signal.aborted ||
        currentUserIdRef.current !== userId
      ) {
        return;
      }

      const errors: string[] = [];
      if (taskResult.status === "fulfilled") {
        applyTasks(taskResult.value);
        setTaskError("");
      } else {
        console.error("Unable to load tasks.", taskResult.reason);
        const message = taskResult.reason instanceof Error
          ? taskResult.reason.message
          : "Unable to load your tasks.";
        setTaskError(message);
        errors.push(message);
      }

      if (activityResult.status === "fulfilled") {
        setActivities(activityResult.value);
        setActivityError("");
      } else {
        console.error("Unable to load recent activity.", activityResult.reason);
        const message = activityResult.reason instanceof Error
          ? activityResult.reason.message
          : "Unable to load recent activity.";
        setActivityError(message);
        errors.push(message);
      }

      setSyncError(errors.join(" "));
      if (errors.length === 0) setLastSyncedAt(new Date());
      setTasksLoading(false);
      setActivitiesLoading(false);
      setTasksLoadedForUser(userId);
      setIsSyncing(false);
    }

    void loadTasks();
    return () => {
      active = false;
      controller.abort();
    };
  }, [applyTasks, sessionPending, taskReloadKey, userId]);

  useEffect(() => () => {
    for (const timeoutId of highlightTimeoutsRef.current.values()) {
      window.clearTimeout(timeoutId);
    }
    highlightTimeoutsRef.current.clear();
  }, []);

  useEffect(() => {
    if (sessionPending || !userId || tasksLoadedForUser !== userId) return;

    const controller = new AbortController();
    let active = true;
    let requestInFlight = false;

    async function refreshTasks() {
      if (
        !active ||
        requestInFlight ||
        document.visibilityState !== "visible" ||
        pendingTaskIdsRef.current.size > 0
      ) {
        return;
      }

      requestInFlight = true;
      setIsSyncing(true);
      const [taskResult, activityResult] = await Promise.allSettled([
        fetchTasks(controller.signal),
        fetchTaskActivities(controller.signal),
      ]);
      if (
        !active ||
        controller.signal.aborted ||
        currentUserIdRef.current !== userId
      ) {
        requestInFlight = false;
        return;
      }

      const errors: string[] = [];
      let taskSnapshotApplied = false;
      if (taskResult.status === "fulfilled") {
        if (
          pendingTaskIdsRef.current.size === 0
        ) {
          highlightSyncedTasks(getChangedTaskIds(tasksRef.current, taskResult.value));
          if (!areTasksEqual(tasksRef.current, taskResult.value)) {
            applyTasks(taskResult.value);
          }
          setTaskError("");
          taskSnapshotApplied = true;
        }
      } else {
        console.error("Unable to refresh tasks.", taskResult.reason);
        errors.push(taskResult.reason instanceof Error
          ? taskResult.reason.message
          : "Unable to refresh your tasks.");
      }

      if (activityResult.status === "fulfilled") {
        setActivities(activityResult.value);
        setActivityError("");
      } else {
        console.error("Unable to refresh recent activity.", activityResult.reason);
        const message = activityResult.reason instanceof Error
          ? activityResult.reason.message
          : "Unable to refresh recent activity.";
        setActivityError(message);
        errors.push(message);
      }

      setSyncError(errors.join(" "));
      if (errors.length === 0 && taskSnapshotApplied) {
        setLastSyncedAt(new Date());
      }
      setIsSyncing(errors.length === 0 && !taskSnapshotApplied);
      requestInFlight = false;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void refreshTasks();
    }

    const intervalId = window.setInterval(() => void refreshTasks(), 2000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [applyTasks, highlightSyncedTasks, sessionPending, tasksLoadedForUser, userId]);

  useEffect(() => {
    if (!successMessage) return;
    const timeoutId = window.setTimeout(() => setSuccessMessage(""), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      const target = event.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (!isTyping && event.key.toLowerCase() === "n" && !dialogTask && !isCreatingTask) {
        setIsCreatingTask(true);
      }
      if (event.key === "Escape") {
        setDialogTask(null);
        setIsCreatingTask(false);
        setIsProfileMenuOpen(false);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [dialogTask, isCreatingTask]);

  const today = getLocalDateString();
  const counts = useMemo(() => ({
    total: tasks.length,
    pending: tasks.filter((task) => task.status === "Pending").length,
    inProgress: tasks.filter((task) => task.status === "In Progress").length,
    completed: tasks.filter((task) => task.status === "Completed").length,
  }), [tasks]);
  const upcomingTasks = useMemo(
    () => tasks
      .filter((task) => task.status !== "Completed" && task.dueDate > today)
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate)),
    [tasks, today],
  );
  const dueTodayTasks = useMemo(
    () => tasks.filter((task) => task.status !== "Completed" && task.dueDate === today),
    [tasks, today],
  );

  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filteredTasks = tasks.filter((task) => {
      const matchesView =
        (view !== "upcoming" || task.status !== "Completed") &&
        (view !== "completed" || task.status === "Completed");
      const matchesFilter =
        view === "upcoming" || view === "completed" ? true :
        filter === "All tasks" ||
        (filter === "In progress" && task.status === "In Progress") ||
        (filter === "To do" && task.status === "Pending") ||
        (filter === "Completed" && task.status === "Completed");
      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${task.title} ${task.description} ${task.category}`.toLowerCase().includes(normalizedQuery);
      const matchesProject = selectedProject === null || task.category === selectedProject;
      return matchesView && matchesFilter && matchesQuery && matchesProject;
    });
    return view === "upcoming"
      ? filteredTasks.sort((left, right) => left.dueDate.localeCompare(right.dueDate))
      : filteredTasks;
  }, [filter, query, selectedProject, tasks, view]);

  const viewTitles: Record<DashboardView, { title: string; subtitle: string }> = {
    overview: { title: `Good ${timeGreeting}, ${greetingName}`, subtitle: "Here's what's happening with your projects today." },
    tasks: { title: "My tasks", subtitle: "Everything you need to get done." },
    upcoming: { title: "Upcoming tasks", subtitle: "Your tasks due today and in the days ahead." },
    completed: { title: "Completed tasks", subtitle: "A record of the progress you've made." },
    settings: { title: "Settings", subtitle: "Manage your workspace preferences." },
  };
  const dashboardPath = (section: DashboardView) => {
    if (section === "overview") return "/dashboard";
    return `/dashboard/${section}`;
  };
  const navigationItems: Array<{ label: string; href: string; view: DashboardView; icon: string }> = [
    { label: "Overview", href: dashboardPath("overview"), view: "overview", icon: "grid" },
    { label: "My tasks", href: dashboardPath("tasks"), view: "tasks", icon: "check" },
    { label: "Upcoming", href: dashboardPath("upcoming"), view: "upcoming", icon: "calendar" },
    { label: "Completed", href: dashboardPath("completed"), view: "completed", icon: "chart" },
  ];

  function beginTaskMutation(taskId: string) {
    if (pendingTaskIdsRef.current.has(taskId)) return false;
    pendingTaskIdsRef.current.add(taskId);
    setPendingTaskIds(new Set(pendingTaskIdsRef.current));
    setTaskError("");
    return true;
  }

  function finishTaskMutation(taskId: string) {
    pendingTaskIdsRef.current.delete(taskId);
    setPendingTaskIds(new Set(pendingTaskIdsRef.current));
  }

  async function saveTask(values: TaskFormValues) {
    const task = dialogTask;
    const mutationId = task?.id ?? "new-task";
    if (!beginTaskMutation(mutationId)) return;
    setIsCreatingRequest(!task);
    try {
      const response = await fetch(task ? `/api/tasks/${task.id}` : "/api/tasks", {
        method: task ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        throw new Error(await getApiError(response, task ? "Unable to update the task." : "Unable to create the task."));
      }

      const result: unknown = await response.json();
      if (!isTask(result)) {
        throw new Error("The task service returned invalid task data.");
      }
      if (currentUserIdRef.current !== userId) return;

      if (task) {
        applyTasks(tasksRef.current.map((currentTask) =>
          currentTask.id === task.id ? result : currentTask,
        ));
        setSuccessMessage("Task updated.");
      } else {
        applyTasks([result, ...tasksRef.current]);
        setSuccessMessage("Task created.");
      }
      setDialogTask(null);
      setIsCreatingTask(false);
    } catch (error) {
      console.error("Task save failed.", error);
      const message = error instanceof Error ? error.message : "Unable to save the task.";
      setTaskError(message);
      setSyncError(message);
    } finally {
      finishTaskMutation(mutationId);
      setIsCreatingRequest(false);
    }
  }

  async function cycleStatus(taskId: string) {
    const task = tasks.find((currentTask) => currentTask.id === taskId);
    if (!task || !beginTaskMutation(taskId)) return;
    const nextStatus = task.status === "Completed"
      ? "Pending"
      : statusOptions[(statusOptions.indexOf(task.status) + 1) % statusOptions.length];
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...task, status: nextStatus }),
      });
      if (!response.ok) {
        throw new Error(await getApiError(response, "Unable to update task status."));
      }
      const result: unknown = await response.json();
      if (!isTask(result)) {
        throw new Error("The task service returned invalid task data.");
      }
      if (currentUserIdRef.current !== userId) return;
      applyTasks(tasksRef.current.map((currentTask) =>
        currentTask.id === taskId ? result : currentTask,
      ));
      setSuccessMessage(task.status === "Completed" ? "Task reopened." : `Task marked ${nextStatus.toLowerCase()}.`);
    } catch (error) {
      console.error("Task status update failed.", error);
      const message = error instanceof Error ? error.message : "Unable to update task status.";
      setTaskError(message);
      setSyncError(message);
    } finally {
      finishTaskMutation(taskId);
    }
  }

  async function deleteTask(taskId: string) {
    const task = tasks.find((currentTask) => currentTask.id === taskId);
    if (!task || !window.confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    if (!beginTaskMutation(taskId)) return;
    try {
      const response = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await getApiError(response, "Unable to delete the task."));
      }
      if (currentUserIdRef.current !== userId) return;
      applyTasks(tasksRef.current.filter((currentTask) => currentTask.id !== taskId));
      setDialogTask(null);
      setSuccessMessage("Task deleted.");
    } catch (error) {
      console.error("Task deletion failed.", error);
      const message = error instanceof Error ? error.message : "Unable to delete the task.";
      setTaskError(message);
      setSyncError(message);
    } finally {
      finishTaskMutation(taskId);
    }
  }

  function renderTaskRows(taskList: Task[]) {
    return taskList.map((task) => (
      <article
        className={`task-row ${highlightedTaskIds.has(task.id) ? "task-row-synced" : ""}`}
        key={task.id}
        title={highlightedTaskIds.has(task.id) ? "Updated from another session" : undefined}
      >
        <button
          className={`task-check ${task.status === "Completed" ? "is-checked" : ""}`}
          onClick={() => void cycleStatus(task.id)}
          disabled={pendingTaskIds.has(task.id)}
          aria-label={task.status === "Completed" ? `Reopen ${task.title}` : `Change status for ${task.title}; currently ${task.status}`}
        >{task.status === "Completed" && <Icon name="check" size={13} />}</button>
        <button className="task-main" onClick={() => setDialogTask(task)}>
          <strong className={task.status === "Completed" ? "task-done" : ""}>{task.title}</strong>
          <span>{task.description}</span>
          {highlightedTaskIds.has(task.id) && <small className="task-synced-label">Updated from another session</small>}
        </button>
        <span className={`category-tag category-${task.category.toLowerCase()}`}>{task.category}</span>
        <span className={`priority-tag priority-${task.priority.toLowerCase()}`}><i />{task.priority}</span>
        <button className="task-date" onClick={() => setDialogTask(task)}><Icon name="calendar" size={14} />{formatDueDate(task.dueDate)}</button>
        <button className="icon-button task-menu" aria-label={`Edit ${task.title}`} onClick={() => setDialogTask(task)}><Icon name="dots" size={17} /></button>
      </article>
    ));
  }

  const completedPercentage = counts.total === 0 ? 0 : Math.round((counts.completed / counts.total) * 100);
  const syncStatus = isSyncing ? "syncing" : syncError ? "error" : "synced";
  const syncLabel = isSyncing ? "Syncing" : syncError ? "Connection issue" : "Live / Synced";
  const lastSyncLabel = lastSyncedAt
    ? `Last synced ${lastSyncedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : "No successful sync yet";
  const workspaceReady =
    !sessionPending &&
    userId !== null &&
    !tasksLoading &&
    tasksLoadedForUser === userId;

  if (!workspaceReady) {
    return (
      <main className="app-shell">
        <section className="main-panel">
          <div className="dashboard-content">
            <p className="loading-message" role="status">Loading your workspace…</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard" aria-label="TaskFlow home">
          <span className="brand-mark"><Icon name="check" size={20} /></span>
          <span>taskflow<span className="brand-period">.</span></span>
        </Link>

        <div className="workspace-switcher">
          <div className="workspace-avatar">S</div>
          <span className="workspace-copy"><strong>Studio workspace</strong><small>Free plan</small></span>
          <span className="workspace-chevron" aria-hidden="true">⌄</span>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <p className="nav-label">WORKSPACE</p>
          {navigationItems.map((item) => (
            <Link
              key={item.view}
              className={`nav-item ${view === item.view ? "active" : ""}`}
              href={item.href}
              aria-label={item.label}
              aria-current={view === item.view ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.view === "tasks" && <span className="nav-count">{counts.total}</span>}
            </Link>
          ))}
          <AdminNavigation isAdmin={isAdmin} variant="desktop" />

          <p className="nav-label projects-label">YOUR PROJECTS <button className="small-plus" aria-label="Create a task" onClick={() => setIsCreatingTask(true)}>+</button></p>
          <Link className={`project-item ${selectedProject === "Design" ? "project-active" : ""}`} href={dashboardPath("tasks")} onClick={() => setSelectedProject(selectedProject === "Design" ? null : "Design")} aria-current={selectedProject === "Design" ? "location" : undefined}><span className="project-dot dot-violet" /> Website redesign</Link>
          <Link className={`project-item ${selectedProject === "Marketing" ? "project-active" : ""}`} href={dashboardPath("tasks")} onClick={() => setSelectedProject(selectedProject === "Marketing" ? null : "Marketing")} aria-current={selectedProject === "Marketing" ? "location" : undefined}><span className="project-dot dot-orange" /> Marketing launch</Link>
          <Link className={`project-item ${selectedProject === "Personal" ? "project-active" : ""}`} href={dashboardPath("tasks")} onClick={() => setSelectedProject(selectedProject === "Personal" ? null : "Personal")} aria-current={selectedProject === "Personal" ? "location" : undefined}><span className="project-dot dot-green" /> Personal goals</Link>
        </nav>

        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <span className="upgrade-icon"><Icon name="sparkle" size={17} /></span>
            <strong>Make room for more</strong>
            <p>You&apos;re doing great. Explore more ways to stay organized.</p>
            <button onClick={() => setIsCreatingTask(true)}>Create a task <Icon name="arrow" size={14} /></button>
          </div>
          <Link className={`nav-item settings-item ${view === "settings" ? "active" : ""}`} href={dashboardPath("settings")} aria-current={view === "settings" ? "page" : undefined}><Icon name="settings" /><span>Settings</span></Link>
          <div className="profile-menu-container">
          <button className="profile-button" aria-expanded={isProfileMenuOpen} aria-haspopup="menu" onClick={() => setIsProfileMenuOpen((isOpen) => !isOpen)}>
            <span className="profile-avatar">{profileInitials}</span>
            <span className="profile-copy">
              <strong style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profileName}</span>
                {isAdmin && (
                  <span style={{ flex: "none", borderRadius: 4, background: "#f1effe", padding: "2px 4px", color: "#5e4bd5", fontSize: 8, fontWeight: 700, letterSpacing: ".4px" }}>
                    ADMIN
                  </span>
                )}
              </strong>
              <small>{profileEmail}</small>
            </span>
            <Icon name="dots" size={18} />
          </button>
          {isProfileMenuOpen && <div className="profile-menu" role="menu">
            <div className="profile-menu-heading"><strong>{profileName}</strong><span>{profileEmail}</span></div>
            <Link href={dashboardPath("settings")} role="menuitem" onClick={() => setIsProfileMenuOpen(false)}>Workspace settings</Link>
            {logoutError && <p className="profile-menu-error" role="alert">{logoutError}</p>}
            <button className="profile-menu-logout" role="menuitem" disabled={isLoggingOut} onClick={handleLogout}>
              {isLoggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>}
          </div>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{viewTitles[view].title}</strong></div>
          <div className="topbar-actions">
            <label className="search-box">
              <Icon name="search" size={17} />
              <input ref={searchInputRef} aria-label="Search tasks" placeholder="Search anything..." value={query} onChange={(event) => setQuery(event.target.value)} />
              <kbd>⌘ K</kbd>
            </label>
            <Link className="icon-button notification-button" href={dashboardPath("upcoming")} aria-label="Upcoming task reminders"><Icon name="bell" size={18} /><i /></Link>
            <span className="topbar-divider" />
            <Link className="date-button" href={dashboardPath("upcoming")}><Icon name="calendar" size={16} /> {getTodayLabel()}</Link>
            <div className="profile-menu-container mobile-profile-container">
              <button className="mobile-profile-button" aria-label="Account options" aria-expanded={isProfileMenuOpen} aria-haspopup="menu" onClick={() => setIsProfileMenuOpen((isOpen) => !isOpen)}>{profileInitials}</button>
              {isProfileMenuOpen && <div className="profile-menu" role="menu">
                <div className="profile-menu-heading"><strong>{profileName}</strong><span>{profileEmail}</span></div>
                <Link href={dashboardPath("settings")} role="menuitem" onClick={() => setIsProfileMenuOpen(false)}>Workspace settings</Link>
                {logoutError && <p className="profile-menu-error" role="alert">{logoutError}</p>}
                <button className="profile-menu-logout" role="menuitem" disabled={isLoggingOut} onClick={handleLogout}>
                  {isLoggingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>}
            </div>
          </div>
        </header>
        <nav className="mobile-nav" aria-label="Main navigation">
          {navigationItems.map((item) => (
            <Link key={item.view} className={`mobile-nav-item ${view === item.view ? "active" : ""}`} href={item.href} aria-current={view === item.view ? "page" : undefined}>
              <Icon name={item.icon} size={16} /><span>{item.label}</span>
            </Link>
          ))}
          <AdminNavigation isAdmin={isAdmin} variant="mobile" />
          <Link className={`mobile-nav-item ${view === "settings" ? "active" : ""}`} href={dashboardPath("settings")} aria-current={view === "settings" ? "page" : undefined}><Icon name="settings" size={16} /><span>Settings</span></Link>
        </nav>

        <div className="dashboard-content">
          {(taskError || syncError) && (
            <p className="storage-message" role="alert">
              {taskError || syncError}{" "}
              <button className="text-button" onClick={() => setTaskReloadKey((key) => key + 1)}>
                Retry
              </button>
            </p>
          )}
          {successMessage && <p className="success-message" role="status">{successMessage}</p>}
          {view === "settings" ? (
            <>
              <section className="welcome-row">
                <div>
                  <p className="eyebrow welcome-eyebrow"><Icon name="settings" size={15} /> WORKSPACE PREFERENCES</p>
                  <h1>{viewTitles.settings.title}</h1>
                  <p className="welcome-subtitle">{viewTitles.settings.subtitle}</p>
                </div>
                <div className="welcome-actions">
                  <SyncIndicator
                    status={syncStatus}
                    label={syncLabel}
                    lastSyncLabel={lastSyncLabel}
                    error={syncError}
                  />
                </div>
              </section>
              <section className="settings-grid">
                <article className="settings-card panel">
                  <div className="panel-heading"><div><h2>Workspace</h2><p>Your current TaskFlow workspace.</p></div></div>
                  <dl className="settings-details">
                    <div><dt>Name</dt><dd>Studio workspace</dd></div>
                    <div><dt>Plan</dt><dd>Free plan</dd></div>
                    <div><dt>Data</dt><dd>Tasks stored in your account</dd></div>
                  </dl>
                </article>
                <article className="settings-card panel">
                  <div className="panel-heading"><div><h2>Appearance</h2><p>TaskFlow interface preferences.</p></div></div>
                  <div className="appearance-option"><span className="appearance-swatch" /><span><strong>Light mode</strong><small>Current appearance</small></span><span className="appearance-selected">Selected</span></div>
                </article>
                <article className="settings-card panel settings-coming-soon">
                  <div className="panel-heading"><div><h2>Account and sync</h2><p>These controls are not available in the demo yet.</p></div><span className="coming-soon-badge">COMING SOON</span></div>
                  <p className="coming-soon-copy">Sign-in, profile management, notifications, and cloud-synced preferences have not been implemented.</p>
                </article>
                <p className="settings-note">Settings shown here are informational. No account data or preferences are saved.</p>
              </section>
            </>
          ) : (
          <>
          <section className="welcome-row">
            <div>
              <p className="eyebrow welcome-eyebrow"><Icon name={view === "overview" ? "sun" : view === "completed" ? "check" : "calendar"} size={15} /> {view === "overview" ? getTodayLabel().toUpperCase() : view.toUpperCase()}</p>
              <h1>{viewTitles[view].title}{view === "overview" && <span className="wave" aria-hidden="true">✦</span>}</h1>
              <p className="welcome-subtitle">{viewTitles[view].subtitle}</p>
            </div>
            <div className="welcome-actions">
              <SyncIndicator
                status={syncStatus}
                label={syncLabel}
                lastSyncLabel={lastSyncLabel}
                error={syncError}
              />
              <button className="button button-primary create-button" onClick={() => setIsCreatingTask(true)}><Icon name="plus" size={17} /> New task</button>
            </div>
          </section>

          {view === "overview" && <section className="stats-grid" aria-label="Task summary">
            <article className="stat-card">
              <div className="stat-top"><span className="stat-icon total-icon"><Icon name="grid" size={18} /></span><span className="stat-trend">All time</span></div>
              <p className="stat-label">Total tasks</p><div className="stat-value">{counts.total}<span className="stat-caption">in your workspace</span></div>
              <div className="stat-bar"><span className="bar-violet" style={{ width: `${counts.total ? 100 : 0}%` }} /></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span className="stat-icon progress-icon"><Icon name="clock" size={18} /></span><span className="stat-trend trend-blue">On track</span></div>
              <p className="stat-label">In progress</p><div className="stat-value">{counts.inProgress}<span className="stat-caption">active right now</span></div>
              <div className="stat-bar"><span className="bar-blue" style={{ width: `${counts.total ? (counts.inProgress / counts.total) * 100 : 0}%` }} /></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span className="stat-icon pending-icon"><Icon name="calendar" size={18} /></span><span className="stat-trend trend-orange">Keep going</span></div>
              <p className="stat-label">To do</p><div className="stat-value">{counts.pending}<span className="stat-caption">waiting for you</span></div>
              <div className="stat-bar"><span className="bar-orange" style={{ width: `${counts.total ? (counts.pending / counts.total) * 100 : 0}%` }} /></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span className="stat-icon completed-icon"><Icon name="check" size={18} /></span><span className="stat-trend trend-green">Nice work!</span></div>
              <p className="stat-label">Completed</p><div className="stat-value">{counts.completed}<span className="stat-caption">tasks finished</span></div>
              <div className="stat-bar"><span className="bar-green" style={{ width: `${completedPercentage}%` }} /></div>
            </article>
          </section>}

          <section className="content-grid">
            <div className="tasks-panel panel">
              <div className="panel-heading">
                <div><h2>{view === "upcoming" ? "Due dates" : view === "completed" ? "Finished tasks" : view === "tasks" ? "All tasks" : "Your tasks"}</h2><p>{view === "upcoming" ? "Overdue, due today, and future tasks." : view === "completed" ? "You've made this progress." : "A little progress adds up."}</p></div>
                {view === "overview" && <Link className="text-button" href={dashboardPath("tasks")}>View all <Icon name="arrow" size={15} /></Link>}
              </div>
              {(view === "overview" || view === "tasks") && <div className="task-toolbar" role="tablist" aria-label="Filter tasks">
                {filters.map((taskFilter) => (
                  <button
                    key={taskFilter}
                    role="tab"
                    aria-selected={filter === taskFilter}
                    className={`filter-tab ${filter === taskFilter ? "selected" : ""}`}
                    onClick={() => setFilter(taskFilter)}
                  >{taskFilter}{taskFilter === "All tasks" && <span className="filter-count">{counts.total}</span>}</button>
                ))}
              </div>}
              {view === "upcoming" && visibleTasks.length > 0 ? (
                <div className="task-list date-group-list">
                  <section className="date-group">
                    <h3>Overdue <span>{visibleTasks.filter((task) => task.dueDate < today).length}</span></h3>
                    {renderTaskRows(visibleTasks.filter((task) => task.dueDate < today))}
                    {visibleTasks.every((task) => task.dueDate >= today) && <p className="group-empty">No overdue tasks.</p>}
                  </section>
                  <section className="date-group">
                    <h3>Due today <span>{visibleTasks.filter((task) => task.dueDate === today).length}</span></h3>
                    {renderTaskRows(visibleTasks.filter((task) => task.dueDate === today))}
                    {visibleTasks.every((task) => task.dueDate !== today) && <p className="group-empty">No tasks due today.</p>}
                  </section>
                  <section className="date-group">
                    <h3>Upcoming <span>{visibleTasks.filter((task) => task.dueDate > today).length}</span></h3>
                    {renderTaskRows(visibleTasks.filter((task) => task.dueDate > today))}
                    {visibleTasks.every((task) => task.dueDate <= today) && <p className="group-empty">No future tasks.</p>}
                  </section>
                </div>
              ) : visibleTasks.length > 0 ? (
                <div className="task-list">
                  {renderTaskRows(visibleTasks)}
                </div>
              ) : (
                <div className="empty-state"><span className="empty-icon"><Icon name={view === "completed" ? "check" : view === "upcoming" ? "calendar" : "search"} size={22} /></span><strong>{query ? "No matching tasks" : view === "completed" ? "No completed tasks" : view === "upcoming" ? "No upcoming tasks" : "No tasks yet"}</strong><p>{query ? "Try another search term." : view === "completed" ? "Completed tasks will appear here. Finish or reopen a task to update this list." : view === "upcoming" ? "Tasks with past or future due dates will appear here." : "Create your first task to get started."}</p>{view !== "completed" && <button className="button button-primary" onClick={() => setIsCreatingTask(true)}><Icon name="plus" size={16} /> Create a task</button>}</div>
              )}
              <button className="add-task-row" onClick={() => setIsCreatingTask(true)}><span><Icon name="plus" size={16} /> Add a task</span><kbd>N</kbd></button>
            </div>

            <aside className="right-column">
              <section className="focus-card panel">
                <div className="focus-card-heading"><span className="focus-sparkle"><Icon name="sparkle" size={18} /></span><span className="focus-label">YOUR FOCUS</span><Link className="icon-button" href={dashboardPath("settings")} aria-label="Focus settings"><Icon name="dots" size={17} /></Link></div>
                <h3>You&apos;re building<br />great momentum.</h3>
                <p>You&apos;ve completed <strong>{counts.completed} {counts.completed === 1 ? "task" : "tasks"}</strong> so far. Keep the streak alive!</p>
                <div className="focus-progress"><div><span>Weekly progress</span><strong>{completedPercentage}%</strong></div><div className="progress-track"><span style={{ width: `${completedPercentage}%` }} /></div></div>
                <div className="focus-footer"><span className="avatar-stack"><i>J</i><i>A</i><i>M</i></span><span>You&apos;re making great progress</span></div>
              </section>

              <section className="upcoming-card panel">
                <div className="panel-heading upcoming-heading"><div><h2>Coming up</h2><p>Stay one step ahead.</p></div><Link className="icon-button" href={dashboardPath("upcoming")} aria-label="Upcoming task list"><Icon name="dots" size={17} /></Link></div>
                <div className="upcoming-list">
                  {upcomingTasks.slice(0, 3).map((task) => (
                    <button className="upcoming-item" key={task.id} onClick={() => setDialogTask(task)}>
                      <span className="upcoming-date"><strong>{new Date(`${task.dueDate}T12:00:00`).getDate()}</strong><small>{new Date(`${task.dueDate}T12:00:00`).toLocaleDateString("en-US", { month: "short" })}</small></span>
                      <span className="upcoming-copy"><strong>{task.title}</strong><small>{task.category} <i /> {formatDueDate(task.dueDate)}</small></span>
                      <span className={`upcoming-dot upcoming-${task.priority.toLowerCase()}`} />
                    </button>
                  ))}
                  {upcomingTasks.length === 0 && dueTodayTasks.length === 0 && <p className="no-upcoming">You&apos;re all caught up. Enjoy the breathing room!</p>}
                  {dueTodayTasks.length > 0 && <p className="no-upcoming">{dueTodayTasks.length} {dueTodayTasks.length === 1 ? "task is" : "tasks are"} due today.</p>}
                </div>
                <Link className="calendar-link" href={dashboardPath("upcoming")}>See all upcoming <Icon name="arrow" size={15} /></Link>
              </section>

              {view === "overview" && <section className="activity-card panel">
                <div className="panel-heading activity-heading">
                  <div><h2>Recent activity</h2><p>Recent changes to your tasks.</p></div>
                  <span className="activity-live">LIVE</span>
                </div>
                {activityError ? (
                  <p className="activity-state" role="alert">Activity unavailable: {activityError}</p>
                ) : activitiesLoading ? (
                  <p className="activity-state" role="status">Loading recent activity…</p>
                ) : activities.length === 0 ? (
                  <p className="activity-state">Task changes will appear here as they happen.</p>
                ) : (
                  <ol className="activity-list">
                    {activities.map((activity) => (
                      <li className={`activity-item activity-${activity.type}`} key={activity.id}>
                        <span className="activity-marker" aria-hidden="true" />
                        <div className="activity-copy">
                          <p><strong>{activityVerbs[activity.type]}</strong> task <span>&quot;{activity.taskTitle}&quot;</span></p>
                          <time dateTime={activity.createdAt}>
                            {new Date(activity.createdAt).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>}
            </aside>
          </section>

          <footer className="dashboard-footer"><span>Made for meaningful progress <span aria-hidden="true">✳</span></span><span>TaskFlow workspace</span></footer>
          </>)}
        </div>
      </section>
      {(isCreatingTask || dialogTask) && <TaskDialog
        key={dialogTask?.id ?? "new-task"}
        task={dialogTask}
        onClose={() => { setIsCreatingTask(false); setDialogTask(null); }}
        onSave={saveTask}
        onDelete={deleteTask}
        userId={userId}
        isSaving={isCreatingRequest || Boolean(dialogTask && pendingTaskIds.has(dialogTask.id))}
        isDeleting={Boolean(dialogTask && pendingTaskIds.has(dialogTask.id))}
      />}
    </main>
  );
}
