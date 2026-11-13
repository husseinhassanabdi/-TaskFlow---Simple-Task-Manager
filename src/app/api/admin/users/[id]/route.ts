import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/authorization";
import { getAuth } from "@/lib/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UserAction =
  | { action: "set-role"; role: "admin" | "user" }
  | { action: "ban" }
  | { action: "unban" }
  | { action: "request-password-reset" };

function isUserAction(value: unknown): value is UserAction {
  if (typeof value !== "object" || value === null || !("action" in value)) return false;
  if (
    value.action === "ban" ||
    value.action === "unban" ||
    value.action === "request-password-reset"
  ) {
    return true;
  }
  return (
    value.action === "set-role" &&
    "role" in value &&
    (value.role === "admin" || value.role === "user")
  );
}

function getErrorStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return 500;
  const { statusCode } = error;
  return typeof statusCode === "number" && [400, 401, 403, 404, 409].includes(statusCode)
    ? statusCode
    : 500;
}

function getErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("body" in error)) return undefined;
  const { body } = error;
  if (typeof body !== "object" || body === null || !("code" in body)) return undefined;
  return typeof body.code === "string" ? body.code : undefined;
}

async function getTargetUser(userId: string, requestHeaders: Headers) {
  const auth = await getAuth();
  const user = await auth.api.getUser({
    query: { id: userId },
    headers: requestHeaders,
  });
  return { auth, user };
}

async function countAdministrators(auth: Awaited<ReturnType<typeof getAuth>>, requestHeaders: Headers) {
  const pageSize = 100;
  let offset = 0;
  let total = 0;
  let administratorCount = 0;

  do {
    const result = await auth.api.listUsers({
      query: { limit: pageSize, offset },
      headers: requestHeaders,
    });
    total = result.total;
    administratorCount += result.users.filter((user) =>
      user.role?.split(",").includes("admin"),
    ).length;
    offset += result.users.length;
    if (result.users.length === 0) break;
  } while (offset < total);

  return administratorCount;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const adminSession = await getAdminSession();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!id || id.length > 200) {
    return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
  }

  try {
    const { user } = await getTargetUser(id, request.headers);
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        role: user.role?.split(",").includes("admin") ? "Admin" : "User",
        banned: user.banned ?? false,
        banReason: user.banReason ?? null,
        banExpires: user.banExpires?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    const status = getErrorStatus(error);
    console.error("Failed to load admin user details.", {
      name: error instanceof Error ? error.name : "UnknownError",
      status,
      code: getErrorCode(error),
    });
    return NextResponse.json(
      { error: status === 404 ? "User not found." : "Unable to load user details." },
      { status },
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const adminSession = await getAdminSession();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!id || id.length > 200) {
    return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isUserAction(body)) {
    return NextResponse.json({ error: "Invalid user action." }, { status: 400 });
  }

  const action = body;
  let actionStage = "loading target account";
  try {
    const requestHeaders = request.headers;
    const { auth, user } = await getTargetUser(id, requestHeaders);

    if (action.action === "set-role") {
      if (action.role === "user") {
        if (id === adminSession.user.id) {
          return NextResponse.json({ error: "You cannot demote your own admin account." }, { status: 400 });
        }

        if (user.role?.split(",").includes("admin")) {
          const administratorCount = await countAdministrators(auth, requestHeaders);
          if (administratorCount <= 1) {
            return NextResponse.json({ error: "The last administrator cannot be demoted." }, { status: 409 });
          }
        }
      }

      actionStage = "changing the user's role";
      await auth.api.setRole({
        body: { userId: id, role: action.role },
        headers: requestHeaders,
      });
      return NextResponse.json({ message: `Role changed to ${action.role === "admin" ? "Admin" : "User"}.` });
    }

    if (action.action === "ban") {
      if (id === adminSession.user.id) {
        return NextResponse.json({ error: "You cannot ban your own account." }, { status: 400 });
      }
      if (user.banned) {
        return NextResponse.json({ error: "This account is already banned." }, { status: 409 });
      }

      actionStage = "banning the user";
      await auth.api.banUser({
        body: { userId: id, banReason: "Banned by an administrator" },
        headers: requestHeaders,
      });
      return NextResponse.json({ message: "User banned." });
    }

    if (action.action === "unban") {
      if (!user.banned) {
        return NextResponse.json({ error: "This account is not banned." }, { status: 409 });
      }

      actionStage = "unbanning the user";
      await auth.api.unbanUser({
        body: { userId: id },
        headers: requestHeaders,
      });
      return NextResponse.json({ message: "User unbanned." });
    }

    actionStage = "requesting a password reset";
    await auth.api.requestPasswordReset({
      body: {
        email: user.email,
        redirectTo: new URL("/reset-password", request.nextUrl.origin).toString(),
      },
      headers: requestHeaders,
    });
    return NextResponse.json({ message: `Password reset email requested for ${user.email}.` });
  } catch (error) {
    const status = getErrorStatus(error);
    console.error("Admin user action failed.", {
      stage: actionStage,
      name: error instanceof Error ? error.name : "UnknownError",
      status,
      code: getErrorCode(error),
    });
    return NextResponse.json(
      {
        error: status === 404
          ? "User not found."
          : status === 403
            ? "Better Auth denied this operation. Verify that your admin account has the required user-management permission."
            : "Unable to complete this user action.",
      },
      { status },
    );
  }
}
