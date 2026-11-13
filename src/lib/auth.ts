import "server-only";

import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import mongoose from "mongoose";
import { Resend } from "resend";
import connectToDatabase from "@/lib/mongodb";

function getAuthBaseURL() {
  if (process.env.NODE_ENV === "development") {
    return {
      allowedHosts: ["localhost:*", "127.0.0.1:*"],
      protocol: "http" as const,
    };
  }

  const baseURL = process.env.BETTER_AUTH_URL;
  if (!baseURL) {
    throw new Error("BETTER_AUTH_URL is required outside development.");
  }

  return baseURL;
}

async function createAuth() {
  await connectToDatabase();
  const database = mongoose.connection.db;
  if (!database) {
    throw new Error("MongoDB connected without an active database.");
  }

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required.");
  }

  const baseURL = getAuthBaseURL();

  return betterAuth({
    baseURL,
    secret,
    ...(typeof baseURL === "string" && {
      trustedOrigins: [new URL(baseURL).origin],
    }),
    database: mongodbAdapter(database, {
      client: mongoose.connection.getClient(),
    }),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
          throw new Error("RESEND_API_KEY is required to send password reset emails.");
        }

        const resend = new Resend(apiKey);
        const { error } = await resend.emails.send({
          from: "onboarding@resend.dev",
          to: user.email,
          subject: "Reset your TaskFlow password",
          text: `Use the following link to reset your TaskFlow password:\n\n${url}`,
        });

        if (error) {
          console.error("Failed to send password reset email.", {
            name: error.name,
            message: error.message,
            statusCode: error.statusCode,
          });
          throw new Error("Unable to send password reset email.");
        }
      },
    },
    plugins: [admin({ defaultRole: "user" })],
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
    },
  });
}

type AuthInstance = Awaited<ReturnType<typeof createAuth>>;

const globalForAuth = globalThis as typeof globalThis & {
  taskflowAuthWithResetEmailPromise?: Promise<AuthInstance>;
};

export async function getAuth(): Promise<AuthInstance> {
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required to initialize authentication.");
  }
  getAuthBaseURL();

  let authPromise = globalForAuth.taskflowAuthWithResetEmailPromise;
  if (!authPromise) {
    authPromise = createAuth().catch((error: unknown) => {
      globalForAuth.taskflowAuthWithResetEmailPromise = undefined;
      throw error;
    });
    globalForAuth.taskflowAuthWithResetEmailPromise = authPromise;
  }

  return authPromise;
}

export async function getSession() {
  const auth = await getAuth();
  const { headers } = await import("next/headers");
  return auth.api.getSession({ headers: await headers() });
}
