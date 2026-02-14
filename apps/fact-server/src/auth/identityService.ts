/**
 * Identity Service
 * Manages canonical user identities and external identity providers
 */

import { getDb } from "@factdb/db-core";
import type { IdentityTable, UserTable, DatabaseSchema } from "@factdb/db-core";
import crypto from "crypto";

function generateUUID(): string {
  return crypto.randomUUID();
}

export interface AuthUser {
  id: string; // Internal user ID
  provider: string; // 'discord' | 'oidc' | 'openid4vp'
  providerSubject: string; // External subject identifier
  issuer?: string; // For OIDC/federation
  displayName?: string;
  email?: string;
  emailVerified?: boolean;
}

/**
 * Get or create internal user from external identity
 * Implements linking logic: if identity exists, return user; otherwise create both
 */
export async function getOrCreateUserFromIdentity(
  provider: string,
  providerSubject: string,
  issuer: string | null,
  profileData: Record<string, any>
): Promise<AuthUser> {
  const db = getDb();

  // Step 1: Check if this identity already exists
  let query = db
    .selectFrom("identity")
    .selectAll()
    .where("provider", "=", provider)
    .where("providerSubject", "=", providerSubject);

  if (issuer) {
    query = query.where("issuer", "=", issuer);
  } else {
    query = query.where("issuer", "is", null);
  }

  const existingIdentity = await query.executeTakeFirst();

  if (existingIdentity) {
    // Update last used time
    await db
      .updateTable("identity")
      .set({ lastUsedAt: new Date().toISOString() })
      .where("id", "=", existingIdentity.id)
      .execute();

    // Fetch and return user
    const user = await db
      .selectFrom("user")
      .selectAll()
      .where("id", "=", existingIdentity.userId)
      .executeTakeFirst();

    if (!user) {
      throw new Error(
        `[identity] User ${existingIdentity.userId} not found for identity`
      );
    }

    return {
      id: user.id,
      provider,
      providerSubject,
      issuer: issuer || undefined,
      displayName: user.displayName || undefined,
      email: user.email || undefined,
      emailVerified: user.emailVerified,
    };
  }

  // Step 2: Identity doesn't exist; create new user + identity
  const userId = generateUUID();
  const identityId = generateUUID();
  const now = new Date().toISOString();

  // Create user
  const displayName =
    profileData.name || profileData.username || profileData.nick;
  const email = profileData.email || null;
  const emailVerified = profileData.verified || false;

  await db
    .insertInto("user")
    .values({
      id: userId,
      createdAt: now,
      updatedAt: now,
      displayName: displayName || null,
      email,
      emailVerified,
    })
    .execute();

  // Create identity
  await db
    .insertInto("identity")
    .values({
      id: identityId,
      userId,
      provider,
      providerSubject,
      issuer: issuer || null,
      profileJson: JSON.stringify(profileData),
      createdAt: now,
      lastUsedAt: now,
    })
    .execute();

  console.log(`[identity] Created new user ${userId} with ${provider} identity`);

  return {
    id: userId,
    provider,
    providerSubject,
    issuer: issuer || undefined,
    displayName: displayName || undefined,
    email: email || undefined,
    emailVerified,
  };
}

/**
 * Link an external identity to an existing user
 */
export async function linkIdentityToUser(
  userId: string,
  provider: string,
  providerSubject: string,
  issuer: string | null,
  profileData: Record<string, any>
): Promise<void> {
  const db = getDb();

  // Verify user exists
  const user = await db
    .selectFrom("user")
    .select("id")
    .where("id", "=", userId)
    .executeTakeFirst();

  if (!user) {
    throw new Error(`[identity] User ${userId} not found`);
  }

  // Check if identity already linked to another user
  const existingIdentity = await db
    .selectFrom("identity")
    .select("userId")
    .where("provider", "=", provider)
    .where("providerSubject", "=", providerSubject)
    .where((eb) =>
      issuer
        ? eb("issuer", "=", issuer)
        : eb("issuer", "is", null)
    )
    .executeTakeFirst();

  if (existingIdentity && existingIdentity.userId !== userId) {
    throw new Error(
      `[identity] ${provider} identity already linked to another user`
    );
  }

  if (!existingIdentity) {
    // Create the link
    await db
      .insertInto("identity")
      .values({
        id: generateUUID(),
        userId,
        provider,
        providerSubject,
        issuer: issuer || null,
        profileJson: JSON.stringify(profileData),
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      })
      .execute();

    console.log(
      `[identity] Linked ${provider} identity to user ${userId}`
    );
  }
}

/**
 * Get all identities for a user
 */
export async function getUserIdentities(userId: string): Promise<IdentityTable[]> {
  const db = getDb();
  return db
    .selectFrom("identity")
    .selectAll()
    .where("userId", "=", userId)
    .execute();
}

/**
 * Get user profile
 */
export async function getUserProfile(userId: string): Promise<UserTable | null> {
  const db = getDb();
  return db
    .selectFrom("user")
    .selectAll()
    .where("id", "=", userId)
    .executeTakeFirst() || null;
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string,
  updates: Partial<{ displayName: string; email: string; emailVerified: boolean }>
): Promise<void> {
  const db = getDb();
  await db
    .updateTable("user")
    .set({
      ...updates,
      updatedAt: new Date().toISOString(),
    })
    .where("id", "=", userId)
    .execute();
}
