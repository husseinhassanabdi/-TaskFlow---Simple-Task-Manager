"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type AdminUserListItem = {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "User";
  registeredAt: string;
  banned: boolean;
  banExpires: string | null;
};

type UserDetails = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: "Admin" | "User";
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  createdAt: string;
  updatedAt: string;
};

function isUserDetails(value: unknown): value is UserDetails {
  if (typeof value !== "object" || value === null) return false;
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "email" in value &&
    typeof value.email === "string" &&
    "emailVerified" in value &&
    typeof value.emailVerified === "boolean" &&
    "role" in value &&
    (value.role === "Admin" || value.role === "User") &&
    "banned" in value &&
    typeof value.banned === "boolean" &&
    "banReason" in value &&
    (typeof value.banReason === "string" || value.banReason === null) &&
    "banExpires" in value &&
    (typeof value.banExpires === "string" || value.banExpires === null) &&
    "createdAt" in value &&
    typeof value.createdAt === "string" &&
    "updatedAt" in value &&
    typeof value.updatedAt === "string"
  );
}

type ConfirmAction = "set-role" | "ban" | "unban" | "request-password-reset";

type AdminUserActionsProps = {
  user: AdminUserListItem;
  currentUserId: string;
  onChanged: () => void;
};

async function getErrorMessage(response: Response, fallback: string) {
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

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminUserActions({
  user,
  currentUserId,
  onChanged,
}: AdminUserActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const isSelf = user.id === currentUserId;

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target) &&
        !menuButtonRef.current?.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  async function loadDetails() {
    setMenuOpen(false);
    setDetails(null);
    setError("");
    setIsLoadingDetails(true);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, "Unable to load user details."));
      }
      const result: unknown = await response.json();
      if (
        typeof result !== "object" ||
        result === null ||
        !("user" in result) ||
        !isUserDetails(result.user)
      ) {
        throw new Error("The user details response was invalid.");
      }
      setDetails(result.user);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load user details.",
      );
    } finally {
      setIsLoadingDetails(false);
    }
  }

  async function submitAction() {
    if (!confirmAction) return;

    setIsSubmitting(true);
    setError("");
    setNotice("");
    const body =
      confirmAction === "set-role"
        ? { action: confirmAction, role: user.role === "Admin" ? "user" : "admin" }
        : { action: confirmAction };

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, "Unable to complete this action."));
      }

      const result: unknown = await response.json();
      const message =
        typeof result === "object" &&
        result !== null &&
        "message" in result &&
        typeof result.message === "string"
          ? result.message
          : "User account updated.";

      setNotice(message);
      setConfirmAction(null);
      onChanged();
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Unable to complete this action.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const confirmationText = confirmAction === "set-role"
    ? `Change ${user.name}'s role to ${user.role === "Admin" ? "User" : "Admin"}?`
    : confirmAction === "ban"
      ? `Ban ${user.name}'s account? They will no longer be able to sign in.`
      : confirmAction === "unban"
        ? `Unban ${user.name}'s account?`
        : `Send a password reset email to ${user.email}?`;

  const confirmationTitle = confirmAction === "set-role"
    ? "Confirm role change"
    : confirmAction === "ban"
      ? "Confirm user ban"
      : confirmAction === "unban"
        ? "Confirm unban"
        : "Send password reset";

  return (
    <>
      <div className="admin-user-actions" onClick={(event) => event.stopPropagation()}>
        <button
          ref={menuButtonRef}
          type="button"
          className="admin-user-menu-button"
          aria-label={`Actions for ${user.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => {
            setNotice("");
            setError("");
            if (!menuOpen) {
              const rect = menuButtonRef.current?.getBoundingClientRect();
              if (rect) {
                const menuHeight = 165;
                setMenuPosition({
                  top: rect.bottom + menuHeight > window.innerHeight
                    ? Math.max(8, rect.top - menuHeight - 4)
                    : rect.bottom + 4,
                  left: Math.max(8, Math.min(rect.right - 190, window.innerWidth - 198)),
                });
              }
            }
            setMenuOpen((open) => !open);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
          </svg>
        </button>
        {menuOpen && typeof document !== "undefined" && createPortal(
          <div
            ref={menuRef}
            className="admin-user-action-menu admin-user-action-menu-floating"
            style={{ top: menuPosition.top, left: menuPosition.left }}
            role="menu"
            aria-label={`${user.name} actions`}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" role="menuitem" onClick={() => void loadDetails()}>
              View details
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={isSelf && user.role === "Admin"}
              title={isSelf && user.role === "Admin" ? "You cannot demote your own account." : undefined}
              onClick={() => {
                setMenuOpen(false);
                setConfirmAction("set-role");
              }}
            >
              Change role to {user.role === "Admin" ? "User" : "Admin"}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={isSelf && !user.banned}
              title={isSelf && !user.banned ? "You cannot ban your own account." : undefined}
              onClick={() => {
                setMenuOpen(false);
                setConfirmAction(user.banned ? "unban" : "ban");
              }}
            >
              {user.banned ? "Unban user" : "Ban user"}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setConfirmAction("request-password-reset");
              }}
            >
              Reset password
            </button>
          </div>,
          document.body,
        )}
        {notice && <span className="admin-user-action-notice" role="status">{notice}</span>}
      </div>

      {(details || isLoadingDetails || error) && !confirmAction && typeof document !== "undefined" && createPortal(
        <div
          className="admin-user-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDetails(null);
              setError("");
            }
          }}
        >
          <section className="admin-user-modal" role="dialog" aria-modal="true" aria-labelledby="admin-user-details-heading">
            <header>
              <div>
                <p className="eyebrow">USER ACCOUNT</p>
                <h2 id="admin-user-details-heading">User details</h2>
              </div>
              <button type="button" className="admin-user-modal-close" aria-label="Close details" onClick={() => { setDetails(null); setError(""); }}>×</button>
            </header>
            {isLoadingDetails ? (
              <p className="admin-user-modal-state" role="status">Loading account details…</p>
            ) : error ? (
              <p className="admin-user-modal-error" role="alert">{error}</p>
            ) : details ? (
              <dl className="admin-user-details">
                <div><dt>Name</dt><dd>{details.name}</dd></div>
                <div><dt>Email</dt><dd>{details.email}</dd></div>
                <div><dt>Role</dt><dd>{details.role}</dd></div>
                <div><dt>Account status</dt><dd>{details.banned ? "Banned" : "Active"}</dd></div>
                <div><dt>Email verified</dt><dd>{details.emailVerified ? "Yes" : "No"}</dd></div>
                <div><dt>Created</dt><dd>{formatDate(details.createdAt)}</dd></div>
                <div><dt>Last updated</dt><dd>{formatDate(details.updatedAt)}</dd></div>
                {details.banReason && <div><dt>Ban reason</dt><dd>{details.banReason}</dd></div>}
                {details.banExpires && <div><dt>Ban expires</dt><dd>{formatDate(details.banExpires)}</dd></div>}
              </dl>
            ) : null}
          </section>
        </div>,
        document.body,
      )}

      {confirmAction && typeof document !== "undefined" && createPortal(
        <div
          className="admin-user-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSubmitting) {
              setConfirmAction(null);
              setError("");
            }
          }}
        >
          <section className="admin-user-modal" role="alertdialog" aria-modal="true" aria-labelledby="admin-user-confirm-heading">
            <header>
              <div>
                <p className="eyebrow">USER ACCOUNT</p>
                <h2 id="admin-user-confirm-heading">{confirmationTitle}</h2>
              </div>
              <button type="button" className="admin-user-modal-close" aria-label="Close confirmation" disabled={isSubmitting} onClick={() => { setConfirmAction(null); setError(""); }}>×</button>
            </header>
            <p className="admin-user-confirm-copy">{confirmationText}</p>
            {error && <p className="admin-user-modal-error" role="alert">{error}</p>}
            <div className="admin-user-modal-actions">
              <button className="button button-quiet" type="button" disabled={isSubmitting} onClick={() => { setConfirmAction(null); setError(""); }}>Cancel</button>
              <button className="button button-primary" type="button" disabled={isSubmitting} onClick={() => void submitAction()}>
                {isSubmitting ? "Please wait…" : "Confirm"}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
