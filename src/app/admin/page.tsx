import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getAdminSession } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const adminSession = await getAdminSession();

  if (!adminSession) {
    const session = await getSession();
    redirect(session ? "/dashboard" : "/login");
  }

  return (
    <main>
      <h1>Admin Dashboard</h1>
      <p>Welcome, {adminSession.user.name}.</p>
    </main>
  );
}
