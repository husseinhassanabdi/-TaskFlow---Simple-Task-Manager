"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: normalizedEmail,
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (result.error) {
        setError(result.error.message || "Unable to request a password reset. Please try again.");
        return;
      }

      setSuccess(
        "If an account exists for that email, a password reset link will be sent shortly.",
      );
    } catch (requestError) {
      console.error("Password reset request failed.", requestError);
      setError("Unable to reach the password reset service. Please try again.");
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

        <section className="auth-card" aria-labelledby="forgot-password-heading">
          <header className="auth-heading">
            <h1 id="forgot-password-heading">Forgot your password?</h1>
            <p>Enter your email and we&apos;ll send you a link to reset your password.</p>
          </header>

          <form className="auth-form" noValidate onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                  setSuccess("");
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "forgot-password-error" : undefined}
                required
              />
              {error && (
                <span className="auth-field-error" id="forgot-password-error">
                  {error}
                </span>
              )}
            </label>

            {success && (
              <p className="auth-notice" role="status">
                {success}
              </p>
            )}

            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Please wait…" : "Send Reset Link"}
            </button>
          </form>

          <p className="auth-switch">
            Remember your password? <Link href="/login">Back to login</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
