/**
 * Clerk's default JWT does not include the email claim in sessionClaims.
 * This module fetches the user's primary email via the Clerk backend API
 * and caches it per userId for the lifetime of the process.
 */
import { createClerkClient } from "@clerk/backend";

// userId → email cache (lives for the server process lifetime)
const cache = new Map<string, string>();

let _client: ReturnType<typeof createClerkClient> | null = null;
function getClerkClient() {
  if (!_client) {
    _client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  }
  return _client;
}

export async function getEmailForUserId(userId: string): Promise<string> {
  if (cache.has(userId)) return cache.get(userId)!;
  try {
    const user = await getClerkClient().users.getUser(userId);
    const email =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      "";
    cache.set(userId, email);
    return email;
  } catch {
    return "";
  }
}

export function isAdminEmail(email: string): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && adminEmails.includes(email.toLowerCase());
}

export async function isAdminUserId(userId: string): Promise<boolean> {
  const email = await getEmailForUserId(userId);
  return isAdminEmail(email);
}
