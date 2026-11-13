import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/authorization";
import { getSession } from "@/lib/auth";
import AdminUsers from "@/components/admin/admin-users";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const adminSession = await getAdminSession();

  if (!adminSession) {
    const session = await getSession();
    redirect(session ? "/dashboard" : "/login");
  }

  return <AdminUsers />;
}
