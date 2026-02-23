const SUPER_ADMIN_EMAILS = new Set(["markmegerian@gmail.com"]);

export const isSuperAdminEmail = (email: string | null | undefined) => {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.has(email.trim().toLowerCase());
};
