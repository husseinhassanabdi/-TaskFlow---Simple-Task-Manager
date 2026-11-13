"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

export default function ResetPasswordForm({
  token,
  hasInvalidToken,
}: {
  token: string | null;
  hasInvalidToken: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!token || hasInvalidToken) {
      setError("This password reset link is invalid or has expired. Request a new one to continue.");
      return;
    }

    if (password.length < 8) {
      setError("Your password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (result.error) {
        setError("This password reset link is invalid or has expired. Request a new one to continue.");
        return;
      }

      setIsSuccess(true);
      window.history.replaceState(null, "", "/reset-password");
    } catch {
      setError("We couldn’t reset your password. The link may be invalid or expired; request a new one to continue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <Link className="auth-brand" href="/login" aria-label="TaskFlow home">
          <span className="auth-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="m5 12.5 4.2 4.2L19.5 6.8" />
            </svg>
          </span>
          <span>taskflow<span className="auth-brand-period">.</span></span>
        </Link>

        <section className="auth-card" aria-labelledby="reset-password-heading">
          <header className="auth-heading">
            <h1 id="reset-password-heading">
              {isSuccess ? "Password reset complete" : "Create a new password"}
            </h1>
            <p>
              {isSuccess
                ? "Your password has been updated. You can now sign in with your new password."
                : "Choose a new password for your TaskFlow account."}
            </p>
          </header>

          {isSuccess ? (
            <p className="auth-notice" role="status">
              Your password was reset successfully.
            </p>
          ) : hasInvalidToken ? (
            <div className="auth-form">
              <p className="auth-notice auth-notice-error" role="alert">
                This password reset link is missing, invalid, or expired. Request a new one to continue.
              </p>
              <Link className="auth-submit" href="/forgot-password">
                Request a new reset link
              </Link>
            </div>
          ) : (
            <form className="auth-form" noValidate onSubmit={handleSubmit}>
              <label className="auth-field">
                <span>New password</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "reset-password-error" : undefined}
                  minLength={8}
                  required
                />
              </label>

              <label className="auth-field">
                <span>Confirm new password</span>
                <input
                  type="password"
                  name="confirmPassword"
                  autoComplete="new-password"
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setError("");
                  }}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "reset-password-error" : undefined}
                  minLength={8}
                  required
                />
              </label>

              {error && (
                <p className="auth-notice auth-notice-error" id="reset-password-error" role="alert">
                  {error}
                </p>
              )}

              <button className="auth-submit" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Updating password…" : "Reset Password"}
              </button>
            </form>
          )}

          <p className="auth-switch">
            <Link href="/login">Back to login</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
