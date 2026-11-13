import ResetPasswordForm from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  const hasInvalidToken = Boolean(params.error) || !token;

  return <ResetPasswordForm token={token} hasInvalidToken={hasInvalidToken} />;
}
