import AuthPage from "@/components/auth/auth-page";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  return <AuthPage mode="login" />;
}
