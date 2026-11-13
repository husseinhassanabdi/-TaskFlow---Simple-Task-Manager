import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getAdminSession } from "@/lib/authorization";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const adminSession = await getAdminSession();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? DEFAULT_PAGE_SIZE);
  const searchValue = params.get("search")?.trim() ?? "";
  const searchField = params.get("searchField") ?? "name";

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_PAGE_SIZE ||
    (searchField !== "name" && searchField !== "email") ||
    !Number.isSafeInteger((page - 1) * pageSize)
  ) {
    return NextResponse.json({ error: "Invalid user-list parameters." }, { status: 400 });
  }

  try {
    const auth = await getAuth();
    const result = await auth.api.listUsers({
      query: {
        limit: pageSize,
        offset: (page - 1) * pageSize,
        sortBy: "createdAt",
        sortDirection: "desc",
        ...(searchValue && {
          searchValue,
          searchField,
          searchOperator: "contains",
        }),
      },
      headers: await headers(),
    });

    return NextResponse.json({
      users: result.users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role?.split(",").includes("admin") ? "Admin" : "User",
        registeredAt: user.createdAt.toISOString(),
        banned: user.banned ?? false,
        banExpires: user.banExpires?.toISOString() ?? null,
      })),
      total: result.total,
      page,
      pageSize,
      currentUserId: adminSession.user.id,
    });
  } catch (error) {
    const details =
      error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
    console.error("Failed to load the admin user list.", details);
    return NextResponse.json({ error: "Unable to load users. Please try again." }, { status: 500 });
  }
}
