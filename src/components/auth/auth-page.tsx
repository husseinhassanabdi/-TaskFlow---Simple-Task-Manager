"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

type AuthMode = "login" | "signup";
type AuthField = "name" | "email" | "password" | "confirmPassword";
type AuthErrors = Partial<Record<AuthField, string>>;

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>({});
  const [notice, setNotice] = useState("");
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearFieldState(field: AuthField) {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setNotice("");
    setNoticeIsError(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextErrors: AuthErrors = {};
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (isSignup && !name) nextErrors.name = "Enter your full name.";
    if (!email) {
      nextErrors.email = "Enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!password) {
      nextErrors.password = "Enter your password.";
    } else if (password.length < 8) {
      nextErrors.password = "Use at least 8 characters.";
    }
    if (isSignup && !confirmPassword) {
      nextErrors.confirmPassword = "Confirm your password.";
    } else if (isSignup && password !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setNotice("");
      setNoticeIsError(false);
      return;
    }

    setIsSubmitting(true);
    setNotice("");
    try {
      const result = isSignup
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({
            email,
            password,
            rememberMe: formData.get("rememberMe") === "on",
          });

      if (result.error) {
        setNotice(result.error.message || "Authentication failed. Please try again.");
        setNoticeIsError(true);
        return;
      }

      if (isSignup) {
        setNotice("Account created successfully. Redirecting to your dashboard…");
        setNoticeIsError(false);
        window.setTimeout(() => {
          router.replace("/dashboard");
        }, 700);
      } else {
        router.replace("/dashboard");
      }
    } catch (error) {
      console.error("Authentication request failed.", error);
      setNotice("Unable to reach the authentication service. Please try again.");
      setNoticeIsError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <Link className="auth-brand" href="/dashboard" aria-label="TaskFlow home">
          <span className="auth-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="m5 12.5 4.2 4.2L19.5 6.8" />
            </svg>
          </span>
          <span>taskflow<span className="auth-brand-period">.</span></span>
        </Link>

        <section className="auth-card" aria-labelledby="auth-heading">
          <header className="auth-heading">
            <h1 id="auth-heading">{isSignup ? "Create your account" : "Welcome back"}</h1>
            <p>
              {isSignup
                ? "Start organizing your work with TaskFlow."
                : "Sign in to continue managing your tasks."}
            </p>
          </header>

          <form className="auth-form" noValidate onSubmit={handleSubmit}>
            {isSignup && (
              <label className="auth-field">
                <span>Full name</span>
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  placeholder="Your name"
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "name-error" : undefined}
                  onChange={() => clearFieldState("name")}
                />
                {errors.name && <span className="auth-field-error" id="name-error">{errors.name}</span>}
              </label>
            )}

            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "email-error" : undefined}
                onChange={() => clearFieldState("email")}
              />
              {errors.email && <span className="auth-field-error" id="email-error">{errors.email}</span>}
            </label>

            <label className="auth-field">
              <span>Password</span>
              <span className="auth-password-wrap">
                <input
                  type={passwordVisible ? "text" : "password"}
                  name="password"
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  placeholder="At least 8 characters"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "password-error" : undefined}
                  onChange={() => clearFieldState("password")}
                />
                <button
                  className="auth-password-toggle"
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? "Hide password" : "Show password"}
                  aria-pressed={passwordVisible}
                >
                  {passwordVisible ? "Hide" : "Show"}
                </button>
              </span>
              {errors.password && <span className="auth-field-error" id="password-error">{errors.password}</span>}
            </label>

            {isSignup && (
              <label className="auth-field">
                <span>Confirm password</span>
                <input
                  type={passwordVisible ? "text" : "password"}
                  name="confirmPassword"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  aria-invalid={Boolean(errors.confirmPassword)}
                  aria-describedby={errors.confirmPassword ? "confirm-password-error" : undefined}
                  onChange={() => clearFieldState("confirmPassword")}
                />
                {errors.confirmPassword && (
                  <span className="auth-field-error" id="confirm-password-error">{errors.confirmPassword}</span>
                )}
              </label>
            )}

            {!isSignup && (
              <div className="auth-form-options">
                <label className="auth-checkbox">
                  <input type="checkbox" name="rememberMe" />
                  <span>Remember me</span>
                </label>
                <Link className="auth-inline-link" href="/forgot-password">
                  Forgot password?
                </Link>
              </div>
            )}

            {notice && (
              <p className={`auth-notice ${noticeIsError ? "auth-notice-error" : ""}`} role={noticeIsError ? "alert" : "status"}>
                {notice}
              </p>
            )}

            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Please wait…" : isSignup ? "Create Account" : "Sign In"}
            </button>
          </form>

          <p className="auth-switch">
            {isSignup ? "Already have an account?" : "Don’t have an account?"}{" "}
            <Link href={isSignup ? "/login" : "/signup"}>
              {isSignup ? "Sign In" : "Sign Up"}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
