/**
 * Clerk's default JWT does not include the email claim in sessionClaims.
 * This module fetches the user's primary email via the Clerk backend API
 * and caches it per userId for the lifetime of the process.
 */
import { createClerkClient } from "@clerk/backend";

export interface ClerkProfile {
  email: string;
  firstName: string | null;
  lastName: string | null;
}

// userId (clerkId) → profile cache (lives for the server process lifetime)
const profileCache = new Map<string, ClerkProfile>();

let _client: ReturnType<typeof createClerkClient> | null = null;
function getClerkClient() {
  if (!_client) {
    _client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  }
  return _client;
}

export async function getClerkProfile(userId: string): Promise<ClerkProfile> {
  const cached = profileCache.get(userId);
  if (cached) return cached;
  try {
    const user = await getClerkClient().users.getUser(userId);
    const email =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      "";
    const profile: ClerkProfile = {
      email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
    };
    profileCache.set(userId, profile);
    return profile;
  } catch (err) {
    console.warn("[CLERK_EMAIL] getClerkProfile failed", { userId, err });
    return { email: "", firstName: null, lastName: null };
  }
}

export async function getEmailForUserId(userId: string): Promise<string> {
  const profile = await getClerkProfile(userId);
  return profile.email;
}

function getAdminEmailsList(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  const adminEmails = getAdminEmailsList();
  const result = !!email && adminEmails.includes(email.toLowerCase());
  console.log("[CLERK_EMAIL] isAdminEmail", {
    email: email || "(empty)",
    adminEmails,
    result,
  });
  return result;
}

export async function isAdminUserId(userId: string): Promise<boolean> {
  const email = await getEmailForUserId(userId);
  const result = isAdminEmail(email);
  console.log("[CLERK_EMAIL] isAdminUserId", { userId, email: email || "(empty)", result });
  return result;
}
