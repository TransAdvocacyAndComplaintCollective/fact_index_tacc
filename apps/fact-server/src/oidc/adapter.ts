/**
 * Database Adapter for oidc-provider
 * Implements persistent storage using Kysely database instead of in-memory
 */

import { getDb } from '@factdb/db-core';
import type { Kysely } from 'kysely';

// Adapter interface types (simplified for our needs)
interface AdapterPayload {
  [key: string]: any;
}

/**
 * Create database tables for OIDC token storage
 */
export async function createOidcStorageTables(db: Kysely<any>): Promise<void> {
  // OIDC tokens and grants storage
  await db.schema
    .createTable('oidc_payload')
    .ifNotExists()
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('type', 'varchar(100)', (col) => col.notNull()) // 'Session', 'AccessToken', 'AuthorizationCode', etc.
    .addColumn('payload', 'text', (col) => col.notNull()) // JSON serialized payload
    .addColumn('grantId', 'varchar(255)')
    .addColumn('userCode', 'varchar(255)')
    .addColumn('uid', 'varchar(255)')
    .addColumn('expiresAt', 'integer') // Unix timestamp
    .addColumn('consumedAt', 'integer') // Unix timestamp (for consumed tokens)
    .execute();

  // Add indices for performance
  await db.schema
    .createIndex('oidc_payload_type_idx')
    .ifNotExists()
    .on('oidc_payload')
    .column('type')
    .execute();

  await db.schema
    .createIndex('oidc_payload_expires_idx')
    .ifNotExists()
    .on('oidc_payload')
    .column('expiresAt')
    .execute();

  await db.schema
    .createIndex('oidc_payload_grant_idx')
    .ifNotExists()
    .on('oidc_payload')
    .column('grantId')
    .execute();

  console.log('[oidc-adapter] OIDC storage tables created');
}

/**
 * Database adapter implementation for oidc-provider
 * Stores tokens, grants, sessions, etc. in the database
 */
export class DatabaseAdapter {
  private type: string;
  private db: Kysely<any>;

  constructor(type: string) {
    this.type = type;
    this.db = getDb();
  }

  /**
   * Return TTL for token type or undefined for persistent
   */
  private getTTL(): number | undefined {
    const ttls: Record<string, number> = {
      Session: 7 * 24 * 60 * 60, // 7 days
      AccessToken: 60 * 60, // 1 hour
      AuthorizationCode: 10 * 60, // 10 minutes
      RefreshToken: 7 * 24 * 60 * 60, // 7 days
      IdToken: 60 * 60, // 1 hour
      ClientCredentials: 60 * 60, // 1 hour
      InitialAccessToken: 60 * 60, // 1 hour
      RegistrationAccessToken: 7 * 24 * 60 * 60, // 7 days
    };
    return ttls[this.type];
  }

  /**
   * Store a new payload
   */
  async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
    const ttl = this.getTTL();
    const expiresAt = expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : 
                     ttl ? Math.floor(Date.now() / 1000) + ttl : null;

    const data = {
      id,
      type: this.type,
      payload: JSON.stringify(payload),
      grantId: payload.grantId || null,
      userCode: payload.userCode || null,
      uid: payload.uid || null,
      expiresAt,
      consumedAt: null,
    };

    await this.db
      .insertInto('oidc_payload')
      .values(data)
      .onConflict((oc) => 
        oc.column('id').doUpdateSet({
          payload: JSON.stringify(payload),
          grantId: payload.grantId || null,
          userCode: payload.userCode || null,
          uid: payload.uid || null,
          expiresAt,
        })
      )
      .execute();
  }

  /**
   * Retrieve a payload by ID
   */
  async find(id: string): Promise<AdapterPayload | undefined> {
    const now = Math.floor(Date.now() / 1000);

    const row = await this.db
      .selectFrom('oidc_payload')
      .selectAll()
      .where('id', '=', id)
      .where('type', '=', this.type)
      .where(eb => eb.or([
        eb('expiresAt', 'is', null),
        eb('expiresAt', '>', now)
      ]))
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return JSON.parse(row.payload as string);
  }

  /**
   * Find payloads by grant ID
   */
  async findByGrantId(grantId: string): Promise<AdapterPayload[]> {
    const now = Math.floor(Date.now() / 1000);

    const rows = await this.db
      .selectFrom('oidc_payload')
      .selectAll()
      .where('grantId', '=', grantId)
      .where(eb => eb.or([
        eb('expiresAt', 'is', null),
        eb('expiresAt', '>', now)
      ]))
      .execute();

    return rows.map(row => JSON.parse(row.payload as string));
  }

  /**
   * Find payloads by user code
   */
  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    const now = Math.floor(Date.now() / 1000);

    const row = await this.db
      .selectFrom('oidc_payload')
      .selectAll()
      .where('userCode', '=', userCode)
      .where('type', '=', this.type)
      .where(eb => eb.or([
        eb('expiresAt', 'is', null),
        eb('expiresAt', '>', now)
      ]))
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return JSON.parse(row.payload as string);
  }

  /**
   * Find payloads by UID
   */
  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const now = Math.floor(Date.now() / 1000);

    const row = await this.db
      .selectFrom('oidc_payload')
      .selectAll()
      .where('uid', '=', uid)
      .where('type', '=', this.type)
      .where(eb => eb.or([
        eb('expiresAt', 'is', null),
        eb('expiresAt', '>', now)
      ]))
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return JSON.parse(row.payload as string);
  }

  /**
   * Mark a token as consumed (for single-use tokens)
   */
  async consume(id: string): Promise<void> {
    const consumedAt = Math.floor(Date.now() / 1000);
    
    await this.db
      .updateTable('oidc_payload')
      .set({ consumedAt })
      .where('id', '=', id)
      .where('type', '=', this.type)
      .execute();
  }

  /**
   * Delete a payload by ID
   */
  async destroy(id: string): Promise<void> {
    await this.db
      .deleteFrom('oidc_payload')
      .where('id', '=', id)
      .where('type', '=', this.type)
      .execute();
  }

  /**
   * Revoke tokens by grant ID (logout/revocation)
   */
  async revokeByGrantId(grantId: string): Promise<void> {
    await this.db
      .deleteFrom('oidc_payload')
      .where('grantId', '=', grantId)
      .execute();
  }

  /**
   * Clean up expired tokens (call periodically)
   */
  static async cleanupExpired(db: Kysely<any>): Promise<number> {
    const now = Math.floor(Date.now() / 1000);

    const result = await db
      .deleteFrom('oidc_payload')
      .where('expiresAt', 'is not', null)
      .where('expiresAt', '<=', now)
      .execute();

    const deletedCount = Array.isArray(result) ? result.length : (result as any).numDeletedRows || 0;
    console.log(`[oidc-adapter] Cleaned up ${deletedCount} expired tokens`);
    return deletedCount;
  }
}

/**
 * Adapter factory function for oidc-provider
 */
export function createAdapterFactory() {
  return (type: string) => new DatabaseAdapter(type);
}