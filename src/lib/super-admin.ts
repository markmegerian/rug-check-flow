const SUPER_ADMIN_EMAILS = new Set(
  (import.meta.env.VITE_SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean)
);

export const isSuperAdminEmail = (email: string | null | undefined) => {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.has(email.trim().toLowerCase());
};
