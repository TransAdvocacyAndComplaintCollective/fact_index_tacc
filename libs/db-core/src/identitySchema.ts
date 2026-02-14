/**
 * Identity & Federation Schema
 * Extends the core database with tables for modern identity management,
 * OpenID Federation, and OpenID4VP support
 */

import type { Kysely } from 'kysely';

/**
 * Canonical internal user identity
 * All external identities (Discord, OIDC, OpenID4VP) link here
 */
export type UserTable = {
  id: string; // UUID or similar
  createdAt: string; // ISO timestamp
  updatedAt: string;
  displayName: string | null;
  email: string | null;
  emailVerified: boolean;
};

/**
 * External identity providers linked to internal user
 * Maps Discord IDs, OIDC subjects, OpenID4VP credentials to users
 */
export type IdentityTable = {
  id: string; // UUID
  userId: string; // FK to user.id
  provider: string; // 'discord' | 'oidc' | 'openid4vp' | ...
  providerSubject: string; // sub from provider, e.g. Discord user ID
  issuer: string | null; // issuer URI for OIDC/federation providers
  profileJson: string; // JSON serialized profile data
  createdAt: string;
  lastUsedAt: string | null;
};

/**
 * Discord guild membership tracking
 * Synced from Discord API during OAuth flow
 */
export type DiscordMembershipTable = {
  userId: string; // FK to user.id
  discordUserId: string; // From identity.providerSubject where provider='discord'
  guildId: string;
  rolesJson: string; // JSON array of Discord role IDs
  syncedAt: string; // ISO timestamp
};

/**
 * Local role assignment
 * Application-specific roles assigned to users
 */
export type LocalRoleAssignmentTable = {
  id: string; // UUID
  userId: string; // FK to user.id
  role: string; // e.g., 'admin', 'facts:contributor', 'moderator'
  domain: string | null; // guild ID if guild-scoped, null = global
  createdAt: string;
  createdBy: string | null; // admin user ID who assigned it
};

/**
 * Discord role → local role mapping
 * Defines how Discord roles convert to application roles
 */
export type DiscordRoleMapTable = {
  id: string; // UUID
  guildId: string;
  discordRoleId: string;
  localRole: string; // target local role name
  domain: string; // usually same as guildId
  createdAt: string;
};

/**
 * Admin-configured Discord mapping records used by UI mapping screens
 */
export type AdminDiscordMappingTable = {
  id: string;
  discord_id_type: string; // user | role | guild
  discord_id: string;
  target_type: string; // action | role
  target_value: string;
  created_at: string;
  updated_at: string;
};

/**
 * Admin-configured OpenID mapping records used by UI mapping screens
 */
export type AdminOpenIdMappingTable = {
  id: string;
  id_type: string; // trust_mark | provider_domain | trust_domain | issuer_domain_user_id | anyone
  domain: string | null;
  num_hops: number | null;
  user_id: string | null;
  target_type: string; // action | role
  target_value: string;
  created_at: string;
  updated_at: string;
};

/**
 * OpenID Federation Entity Configuration
 * Signed entity configs issued for federation subordinates
 */
export type FederationEntityTable = {
  id: string; // UUID
  entityId: string; // https://yourorg.example.com (the entity identifier)
  entityType: string; // 'trust_anchor' | 'intermediate' | 'openid_provider' | 'openid4vp_verifier'
  configurationJwt: string; // Signed Entity Configuration JWT
  publicKeys: string; // JSON array of JWKS keys
  createdAt: string;
  expiresAt: string; // When config signature expires
  updatedAt: string;
};

/**
 * Federation Subordinate Statements
 * Statements issued by federations for their subordinates
 */
export type FederationSubordinateTable = {
  id: string; // UUID
  issuerId: string; // FK to federation_entity.id or just iss string
  subordinateId: string; // Entity identifier of subordinate
  statementJwt: string; // Signed subordinate statement
  createdAt: string;
  expiresAt: string;
};

/**
 * Trust Marks
 * Certification/labeling system for federation entities
 */
export type TrustMarkTable = {
  id: string; // UUID
  type: string; // e.g., 'https://example.com/trust-marks/high-assurance'
  subjectId: string; // Entity identifier of the subject
  jwt: string; // Signed trust mark JWT
  issuedAt: string;
  expiresAt: string;
  status: 'active' | 'revoked' | 'expired';
};

/**
 * OIDC/OpenID4VP Presentation Records
 * Tracks VP tokens received and validated
 */
export type VerifiablePresentationTable = {
  id: string; // UUID
  userId: string | null; // FK to user.id (if authenticated)
  vpToken: string; // The VP token JWT
  verifierMetadata: string; // JSON metadata of verifier
  credentialTypes: string; // JSON array of credential types in VP
  claimsJson: string; // Extracted claims from VP
  validatedAt: string;
  expiresAt: string;
  status: 'valid' | 'invalid' | 'expired';
};

/**
 * Casbin RBAC rules (standard adapter table)
 */
export type CasbinRuleTable = {
  id: string; // UUID or auto-increment
  ptype: string; // 'p' or 'g' etc.
  v0: string | null;
  v1: string | null;
  v2: string | null;
  v3: string | null;
  v4: string | null;
  v5: string | null;
};

/**
 * Extend existing DatabaseSchema with new tables
 */
export function extendDatabaseSchema(schema: any) {
  return {
    ...schema,
    // Identity model
    user: null as any as UserTable,
    identity: null as any as IdentityTable,
    discord_membership: null as any as DiscordMembershipTable,
    local_role_assignment: null as any as LocalRoleAssignmentTable,
    discord_role_map: null as any as DiscordRoleMapTable,
    admin_discord_mapping: null as any as AdminDiscordMappingTable,
    admin_openid_mapping: null as any as AdminOpenIdMappingTable,
    
    // Federation
    federation_entity: null as any as FederationEntityTable,
    federation_subordinate: null as any as FederationSubordinateTable,
    trust_mark: null as any as TrustMarkTable,
    
    // OpenID4VP
    verifiable_presentation: null as any as VerifiablePresentationTable,
  };
}

/**
 * Create the identity and federation schema tables
 */
export async function createIdentityAndFederationSchema(kdb: Kysely<any>): Promise<void> {
  console.log('[identity-schema] Creating identity and federation tables...');

  // user table
  await kdb.schema
    .createTable('user')
    .ifNotExists()
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('createdAt', 'varchar(255)', (col) => col.notNull())
    .addColumn('updatedAt', 'varchar(255)', (col) => col.notNull())
    .addColumn('displayName', 'varchar(255)')
    .addColumn('email', 'varchar(255)')
    .addColumn('emailVerified', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute();
  console.log('[identity-schema] user table created');

  // identity table
  await kdb.schema
    .createTable('identity')
    .ifNotExists()
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('userId', 'varchar(255)', (col) => col.notNull())
    .addColumn('provider', 'varchar(100)', (col) => col.notNull())
    .addColumn('providerSubject', 'varchar(255)', (col) => col.notNull())
    .addColumn('issuer', 'varchar(255)')
    .addColumn('profileJson', 'text', (col) => col.notNull().defaultTo('{}'))
    .addColumn('createdAt', 'varchar(255)', (col) => col.notNull())
    .addColumn('lastUsedAt', 'varchar(255)')
    .addForeignKeyConstraint('userFk', ['userId'], 'user', ['id'])
    .addUniqueConstraint('identity_provider_subject_issuer', ['provider', 'providerSubject', 'issuer'])
    .execute();
  console.log('[identity-schema] identity table created');

  // discord_membership table
  await kdb.schema
    .createTable('discord_membership')
    .ifNotExists()
    .addColumn('userId', 'varchar(255)', (col) => col.notNull())
    .addColumn('discordUserId', 'varchar(255)', (col) => col.notNull())
    .addColumn('guildId', 'varchar(255)', (col) => col.notNull())
    .addColumn('rolesJson', 'text')
    .addColumn('syncedAt', 'varchar(255)', (col) => col.notNull())
    .addForeignKeyConstraint('userFk', ['userId'], 'user', ['id'])
    .addPrimaryKeyConstraint('pk', ['userId', 'guildId'])
    .execute();
  console.log('[identity-schema] discord_membership table created');

  // local_role_assignment table
  await kdb.schema
    .createTable('local_role_assignment')
    .ifNotExists()
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('userId', 'varchar(255)', (col) => col.notNull())
    .addColumn('role', 'varchar(100)', (col) => col.notNull())
    .addColumn('domain', 'varchar(255)')
    .addColumn('createdAt', 'varchar(255)', (col) => col.notNull())
    .addColumn('createdBy', 'varchar(255)')
    .addForeignKeyConstraint('userFk', ['userId'], 'user', ['id'])
    .addUniqueConstraint('role_assignment_unique', ['userId', 'role', 'domain'])
    .execute();
  console.log('[identity-schema] local_role_assignment table created');

  // discord_role_map table
  await kdb.schema
    .createTable('discord_role_map')
    .ifNotExists()
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('guildId', 'varchar(255)', (col) => col.notNull())
    .addColumn('discordRoleId', 'varchar(255)', (col) => col.notNull())
    .addColumn('localRole', 'varchar(100)', (col) => col.notNull())
    .addColumn('domain', 'varchar(255)', (col) => col.notNull())
    .addColumn('createdAt', 'varchar(255)', (col) => col.notNull())
    .addUniqueConstraint('role_map_unique', ['guildId', 'discordRoleId'])
    .execute();
  console.log('[identity-schema] discord_role_map table created');

  // admin_discord_mapping table
  await kdb.schema
    .createTable('admin_discord_mapping')
    .ifNotExists()
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('discord_id_type', 'varchar(32)', (col) => col.notNull())
    .addColumn('discord_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('target_type', 'varchar(32)', (col) => col.notNull())
    .addColumn('target_value', 'varchar(255)', (col) => col.notNull())
    .addColumn('created_at', 'varchar(255)', (col) => col.notNull())
    .addColumn('updated_at', 'varchar(255)', (col) => col.notNull())
    .execute();
  console.log('[identity-schema] admin_discord_mapping table created');

  // admin_openid_mapping table
  await kdb.schema
    .createTable('admin_openid_mapping')
    .ifNotExists()
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('id_type', 'varchar(64)', (col) => col.notNull())
    .addColumn('domain', 'varchar(255)')
    .addColumn('num_hops', 'integer')
    .addColumn('user_id', 'varchar(255)')
    .addColumn('target_type', 'varchar(32)', (col) => col.notNull())
    .addColumn('target_value', 'varchar(255)', (col) => col.notNull())
    .addColumn('created_at', 'varchar(255)', (col) => col.notNull())
    .addColumn('updated_at', 'varchar(255)', (col) => col.notNull())
    .execute();
  console.log('[identity-schema] admin_openid_mapping table created');

  // federation_entity table
  await kdb.schema
    .createTable('federation_entity')
    .ifNotExists()
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('entityId', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('entityType', 'varchar(100)', (col) => col.notNull())
    .addColumn('configurationJwt', 'text', (col) => col.notNull())
    .addColumn('publicKeys', 'text', (col) => col.notNull().defaultTo('[]'))
    .addColumn('createdAt', 'varchar(255)', (col) => col.notNull())
    .addColumn('expiresAt', 'varchar(255)', (col) => col.notNull())
    .addColumn('updatedAt', 'varchar(255)', (col) => col.notNull())
    .execute();
  console.log('[identity-schema] federation_entity table created');

  // federation_subordinate table
  await kdb.schema
    .createTable('federation_subordinate')
    .ifNotExists()
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('issuerId', 'varchar(255)', (col) => col.notNull())
    .addColumn('subordinateId', 'varchar(255)', (col) => col.notNull())
    .addColumn('statementJwt', 'text', (col) => col.notNull())
    .addColumn('createdAt', 'varchar(255)', (col) => col.notNull())
    .addColumn('expiresAt', 'varchar(255)', (col) => col.notNull())
    .addUniqueConstraint('subordinate_unique', ['issuerId', 'subordinateId'])
    .execute();
  console.log('[identity-schema] federation_subordinate table created');

  // trust_mark table
  await kdb.schema
    .createTable('trust_mark')
    .ifNotExists()
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('type', 'varchar(255)', (col) => col.notNull())
    .addColumn('subjectId', 'varchar(255)', (col) => col.notNull())
    .addColumn('jwt', 'text', (col) => col.notNull())
    .addColumn('issuedAt', 'varchar(255)', (col) => col.notNull())
    .addColumn('expiresAt', 'varchar(255)', (col) => col.notNull())
    .addColumn('status', 'varchar(50)', (col) => col.notNull().defaultTo('active'))
    .addUniqueConstraint('trust_mark_unique', ['type', 'subjectId'])
    .execute();
  console.log('[identity-schema] trust_mark table created');

  // verifiable_presentation table
  await kdb.schema
    .createTable('verifiable_presentation')
    .ifNotExists()
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('userId', 'varchar(255)')
    .addColumn('vpToken', 'text', (col) => col.notNull())
    .addColumn('verifierMetadata', 'text', (col) => col.notNull())
    .addColumn('credentialTypes', 'text', (col) => col.notNull())
    .addColumn('claimsJson', 'text', (col) => col.notNull())
    .addColumn('validatedAt', 'varchar(255)', (col) => col.notNull())
    .addColumn('expiresAt', 'varchar(255)', (col) => col.notNull())
    .addColumn('status', 'varchar(50)', (col) => col.notNull().defaultTo('valid'))
    .addForeignKeyConstraint('userFk', ['userId'], 'user', ['id'])
    .execute();
  console.log('[identity-schema] verifiable_presentation table created');

  console.log('[identity-schema] All identity and federation tables created');
}
