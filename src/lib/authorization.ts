import "server-only";

import { getSession } from "@/lib/auth";

type AuthenticatedSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export async function getAdminSession(): Promise<AuthenticatedSession | null> {
  const session = await getSession();
  if (!session) return null;

  const roles = session.user.role?.split(",") ?? [];
  return roles.includes("admin") ? session : null;
}
