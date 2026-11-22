/**
 * The user id a session token is for, read from its payload: what the offline cache is keyed
 * by (gaps row 179), known at boot before `/auth/me` has answered. Not verified, and it needn't
 * be: the server checks the token, this only chooses which saved copies the phone may show.
 * Null when the token is missing or unreadable, which caches nothing.
 */
export const tokenOwner = (token: string | null | undefined): string | null => {
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const userId = (JSON.parse(atob(base64)) as { userId?: unknown }).userId;
    return typeof userId === "string" && /^[a-f0-9]{24}$/i.test(userId) ? userId.toLowerCase() : null;
  }
  catch {
    return null;
  }
};
