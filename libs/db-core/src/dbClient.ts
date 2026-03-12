import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { Kysely, SqliteDialect, MysqlDialect, sql } from 'kysely';
import Database from 'better-sqlite3';
import * as mysql2Promise from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type UsersTable = {
  id: number;
  discord_name: string | null;
  email: string | null;
  is_admin: boolean | null;
};

type FactsTable = {
  id: number;
  timestamp: string;
  fact_text: string;
  source: string | null;
  type: string | null;
  context: string | null;
  year: number | null;
  user_id: number | null;
  is_public: number | boolean | null;
  suppressed: number | boolean | null;
};

type SubjectsTable = {
  id: number;
  name: string;
};

type AudiencesTable = {
  id: number;
  name: string;
};

type FactSubjectsTable = {
  fact_id: number;
  subject_id: number;
};

type FactAudiencesTable = {
  fact_id: number;
  audience_id: number;
};

type DiscordOAuthTokensTable = {
  id: number;
  discord_user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
  scope: string | null;
  created_at: string;
  updated_at: string;
};

type JwtTokenBlacklistTable = {
  id: number;
  token_jti: string;
  discord_user_id: string;
  revoked_at: string;
  expires_at: number;
  reason: string | null;
};

type CasbinRuleTable = {
  id: number;
  ptype: string;
  v0: string | null;
  v1: string | null;
  v2: string | null;
  v3: string | null;
  v4: string | null;
  v5: string | null;
};

type DiscordGuildMemberTable = {
  discord_user_id: string;
  guild_id: string;
  roles_json: string | null;  // JSON array of Discord role IDs
  last_synced_at: string;
};

type AdminDiscordMappingTable = {
  id: string;
  discord_id_type: string; // user | role | guild
  discord_id: string;
  target_type: string; // action | role
  target_value: string;
  created_at: string;
  updated_at: string;
};

type KnownDiscordUserTable = {
  discord_user_id: string;
  discord_username: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

type LoginWhitelistTable = {
  discord_user_id: string;
  created_at: string;
};

type GuildLoginRequirementTable = {
  guild_id: string;
  required_role_ids_json: string | null; // JSON array of Discord role IDs
  updated_at: string;
};

type JwtHmacSecretTable = {
  /** old | current | next */
  slot: string;
  secret: string;
  iat_ms: number;
  /** only set for old secrets */
  exp_ms: number | null;
};

export type DatabaseSchema = {
  users: UsersTable;
  facts: FactsTable;
  discord_oauth_tokens: DiscordOAuthTokensTable;
  jwt_token_blacklist: JwtTokenBlacklistTable;
  jwt_hmac_secrets: JwtHmacSecretTable;
  known_discord_user: KnownDiscordUserTable;
  login_whitelist: LoginWhitelistTable;
  guild_login_requirement: GuildLoginRequirementTable;
  casbin_rule: CasbinRuleTable;
  discord_guild_member: DiscordGuildMemberTable;
  admin_discord_mapping: AdminDiscordMappingTable;
  subjects: SubjectsTable;
  audiences: AudiencesTable;
  fact_subjects: FactSubjectsTable;
  fact_audiences: FactAudiencesTable;
};

// Determine repository root by walking up until we find workspace indicators
export function findRepoRoot(startDir = __dirname): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const pnpm = path.join(dir, 'pnpm-workspace.yaml');
    const nx = path.join(dir, 'nx.json');
    const git = path.join(dir, '.git');
    if (fs.existsSync(pnpm) || fs.existsSync(nx) || fs.existsSync(git)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // fallback to process.cwd()
  return process.cwd();
}

export type DatabaseType = 'sqlite' | 'mysql';

export function getDatabaseType(): DatabaseType {
  const type = (process.env.DB_TYPE || 'sqlite').toLowerCase() as DatabaseType;
  if (!['sqlite', 'mysql'].includes(type)) {
    console.warn(`[db] Invalid DB_TYPE: ${type}, defaulting to sqlite`);
    return 'sqlite';
  }
  return type;
}

const repoRoot = findRepoRoot();
const dbType = getDatabaseType();

// Create a stub database that will be initialized later
// For now, we'll just create a deferred initialization
let db: Kysely<DatabaseSchema> | null = null;

export function getDb(): Kysely<DatabaseSchema> {
  if (!db) {
    const msg = 'Database not yet initialized. Call initializeDb() first. (Note: In dev mode with missing better-sqlite3 bindings, this is expected)';
    if (process.env.NODE_ENV === 'development') {
      console.warn('[db]', msg);
      throw new Error(msg);
    }
    throw new Error(msg);
  }
  return db;
}

export async function initializeDb(): Promise<void> {
  if (db) {
    console.log('[db] Database already initialized');
    return;
  }

  console.log(`[db] Initializing ${dbType.toUpperCase()} database connection...`);
  
  try {
    if (dbType === 'sqlite') {
      await initializeSqlite();
    } else if (dbType === 'mysql') {
      await initializeMysql();
    }
    console.log('[db] Database connection established');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    
    // Check if this is a native binding error (SQLite specific)
    if (dbType === 'sqlite' && (errorMessage.includes('Could not locate the bindings file') || errorMessage.includes('better_sqlite3.node'))) {
      console.warn('[db] WARNING: better-sqlite3 native bindings not available');
      console.warn('[db] To fix this, run: pnpm rebuild better-sqlite3 --build-from-source');
      console.warn('[db] For now, database operations will be limited to dev mode');
      
      // In development, we can continue without a fully functional database
      // The server will still run and serve the frontend
      if (process.env.NODE_ENV === 'development') {
        console.warn('[db] Running in development mode - database is optional');
        return;
      }
    }
    
    console.error('[db] Failed to initialize database:', err);
    throw err;
  }
}

async function initializeSqlite(): Promise<void> {
  const dbPath = path.join(repoRoot, process.env.SQLITE_DB || 'db/dev.sqlite3');
  console.info('[db] SQLite path:', dbPath);

  // Ensure the parent directory exists so sqlite can create the file there.
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  } catch {
    // ignore directory creation errors — sqlite will error later if needed
  }

  const sqlite = new Database(dbPath);
  db = new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
}

async function initializeMysql(): Promise<void> {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const database = process.env.DB_NAME || 'fact_index';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  console.info('[db] MySQL connection to:', `${user}@${host}:${port}/${database}`);

  const pool = mysql2Promise.createPool({
    host,
    port,
    database,
    user,
    password,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  db = new Kysely<DatabaseSchema>({
    dialect: new MysqlDialect({ pool }),
  });
}

export { db };

export async function createSchema(kdb: Kysely<DatabaseSchema>): Promise<void> {
  try {
    console.log('[schema] Starting schema creation...');
    
    // users
    console.log('[schema] Creating users table...');
    await kdb.schema
      .createTable('users')
      .ifNotExists()
      .addColumn('id', 'integer', (col) => 
        dbType === 'sqlite' 
          ? col.primaryKey().autoIncrement()
          : col.primaryKey().autoIncrement()
      )
      .addColumn('discord_name', 'text')
      .addColumn('email', 'text')
      .addColumn('is_admin', 'boolean', (col) => col.notNull().defaultTo(false))
      .execute();
	    console.log('[schema] Users table created');

	    // known_discord_user
	    console.log('[schema] Creating known_discord_user table...');
	    await kdb.schema
	      .createTable('known_discord_user')
	      .ifNotExists()
	      .addColumn('discord_user_id', 'text', (col) => col.primaryKey())
	      .addColumn('discord_username', 'text')
	      .addColumn(
	        'first_seen_at',
	        'timestamp',
	        (col) =>
	          dbType === 'sqlite'
	            ? col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
	            : col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
	      )
	      .addColumn(
	        'last_seen_at',
	        'timestamp',
	        (col) =>
	          dbType === 'sqlite'
	            ? col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
	            : col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
	      )
	      .execute();
    console.log('[schema] known_discord_user table created');

    // login_whitelist
    console.log('[schema] Creating login_whitelist table...');
    await kdb.schema
      .createTable('login_whitelist')
      .ifNotExists()
      .addColumn('discord_user_id', 'text', (col) => col.primaryKey())
      .addColumn(
        'created_at',
        'timestamp',
        (col) =>
          dbType === 'sqlite'
            ? col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
            : col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();
    console.log('[schema] login_whitelist table created');

    // guild_login_requirement
    console.log('[schema] Creating guild_login_requirement table...');
    await kdb.schema
      .createTable('guild_login_requirement')
      .ifNotExists()
      .addColumn('guild_id', 'text', (col) => col.primaryKey())
      .addColumn('required_role_ids_json', 'text')
      .addColumn(
        'updated_at',
        'timestamp',
        (col) =>
          dbType === 'sqlite'
            ? col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
            : col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();
    console.log('[schema] guild_login_requirement table created');

    // subjects
    await kdb.schema
      .createTable('subjects')
      .ifNotExists()
      .addColumn('id', 'integer', (col) => 
        dbType === 'sqlite'
          ? col.primaryKey().autoIncrement()
          : col.primaryKey().autoIncrement()
      )
      .addColumn('name', 'text', (col) => col.notNull().unique())
      .execute();

    // audiences
    await kdb.schema
      .createTable('audiences')
      .ifNotExists()
      .addColumn('id', 'integer', (col) =>
        dbType === 'sqlite'
          ? col.primaryKey().autoIncrement()
          : col.primaryKey().autoIncrement()
      )
      .addColumn('name', 'text', (col) => col.notNull().unique())
      .execute();

    // facts
    console.log('[schema] Creating facts table...');
    await kdb.schema
      .createTable('facts')
      .ifNotExists()
      .addColumn('id', 'integer', (col) =>
        dbType === 'sqlite'
          ? col.primaryKey().autoIncrement()
          : col.primaryKey().autoIncrement()
      )
      .addColumn('timestamp', 'timestamp', (col) => 
        dbType === 'sqlite'
          ? col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
          : col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
      )
      .addColumn('fact_text', 'text', (col) => col.notNull())
      .addColumn('source', 'text')
      .addColumn('type', 'text')
      .addColumn('context', 'text')
      .addColumn('year', 'integer')
      .addColumn('user_id', 'integer', (col) => col.references('users.id').onDelete('set null'))
      .addColumn('is_public', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('suppressed', 'boolean', (col) => col.notNull().defaultTo(false))
      .execute();
    console.log('[schema] Facts table created');

    // discord_oauth_tokens - for persistent OAuth token storage
    console.log('[schema] Creating discord_oauth_tokens table...');
    await kdb.schema
      .createTable('discord_oauth_tokens')
      .ifNotExists()
      .addColumn('id', 'integer', (col) =>
        dbType === 'sqlite'
          ? col.primaryKey().autoIncrement()
          : col.primaryKey().autoIncrement()
      )
      .addColumn('discord_user_id', 'text', (col) => col.notNull().unique())
      .addColumn('access_token', 'text', (col) => col.notNull())
      .addColumn('refresh_token', 'text')
      .addColumn('expires_at', 'integer')
      .addColumn('scope', 'text')
      .addColumn('created_at', 'timestamp', (col) => 
        dbType === 'sqlite'
          ? col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
          : col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
      )
      .addColumn('updated_at', 'timestamp', (col) =>
        dbType === 'sqlite'
          ? col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
          : col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
      )
      .execute();
    console.log('[schema] Discord OAuth tokens table created');

    // jwt_token_blacklist - for revoking JWT tokens (logout, security events)
    console.log('[schema] Creating jwt_token_blacklist table...');
    await kdb.schema
      .createTable('jwt_token_blacklist')
      .ifNotExists()
      .addColumn('id', 'integer', (col) =>
        dbType === 'sqlite'
          ? col.primaryKey().autoIncrement()
          : col.primaryKey().autoIncrement()
      )
      .addColumn('token_jti', 'text', (col) => col.notNull().unique())
      .addColumn('discord_user_id', 'text', (col) => col.notNull())
      .addColumn('revoked_at', 'timestamp', (col) =>
        dbType === 'sqlite'
          ? col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
          : col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
      )
      .addColumn('expires_at', 'integer', (col) => col.notNull())
      .addColumn('reason', 'text')
      .execute();
    console.log('[schema] JWT token blacklist table created');

    // jwt_hmac_secrets - HS256 signing secrets stored in DB (old/current/next)
    console.log('[schema] Creating jwt_hmac_secrets table...');
    await kdb.schema
      .createTable('jwt_hmac_secrets')
      .ifNotExists()
      .addColumn('slot', 'text', (col) => col.primaryKey())
      .addColumn('secret', 'text', (col) => col.notNull())
      .addColumn('iat_ms', 'integer', (col) => col.notNull())
      .addColumn('exp_ms', 'integer')
      .execute();
    console.log('[schema] jwt_hmac_secrets table created');

    // Create index on token_jti for fast lookup
    try {
      await kdb.schema
        .createIndex('idx_jwt_blacklist_jti')
        .ifNotExists()
        .on('jwt_token_blacklist')
        .column('token_jti')
        .execute();
    } catch {
      // ignore index creation errors
    }

    // Create index on discord_user_id to find all revoked tokens for a user
    try {
      await kdb.schema
        .createIndex('idx_jwt_blacklist_user')
        .ifNotExists()
        .on('jwt_token_blacklist')
        .column('discord_user_id')
        .execute();
    } catch {
      // ignore index creation errors
    }

    // Create index on expires_at for cleanup queries
    try {
      await kdb.schema
        .createIndex('idx_jwt_blacklist_expires')
        .ifNotExists()
        .on('jwt_token_blacklist')
        .column('expires_at')
        .execute();
    } catch {
      // ignore index creation errors
    }

    // Ensure index on timestamp
    try {
      console.log('[schema] Creating index...');
      await kdb.schema
        .createIndex('idx_facts_timestamp')
        .ifNotExists()
        .on('facts')
        .column('timestamp')
        .execute();
      console.log('[schema] Index created');
    } catch {
      // ignore index creation errors
    }

    // fact_subjects
    console.log('[schema] Creating fact_subjects table...');
    await kdb.schema
      .createTable('fact_subjects')
      .ifNotExists()
      .addColumn('fact_id', 'integer', (col) => col.references('facts.id').onDelete('cascade'))
      .addColumn('subject_id', 'integer', (col) => col.references('subjects.id').onDelete('cascade'))
      .execute();
    await kdb.schema
      .createIndex('idx_fact_subjects_unique')
      .ifNotExists()
      .on('fact_subjects')
      .unique()
      .columns(['fact_id', 'subject_id'])
      .execute()
      .catch((err) => console.warn('[schema] idx_fact_subjects_unique creation failed:', err));
    console.log('[schema] fact_subjects table created');

    // fact_audiences
    console.log('[schema] Creating fact_audiences table...');
    await kdb.schema
      .createTable('fact_audiences')
      .ifNotExists()
      .addColumn('fact_id', 'integer', (col) => col.references('facts.id').onDelete('cascade'))
      .addColumn('audience_id', 'integer', (col) => col.references('audiences.id').onDelete('cascade'))
      .execute();
    await kdb.schema
      .createIndex('idx_fact_audiences_unique')
      .ifNotExists()
      .on('fact_audiences')
      .unique()
      .columns(['fact_id', 'audience_id'])
      .execute()
      .catch((err) => console.warn('[schema] idx_fact_audiences_unique creation failed:', err));
    console.log('[schema] fact_audiences table created');

    // casbin_rule - stores Casbin RBAC policies
    console.log('[schema] Creating casbin_rule table...');
    await kdb.schema
      .createTable('casbin_rule')
      .ifNotExists()
      .addColumn('id', 'integer', (col) =>
        dbType === 'sqlite'
          ? col.primaryKey().autoIncrement()
          : col.primaryKey().autoIncrement()
      )
      .addColumn('ptype', 'varchar(16)', (col) => col.notNull())
      .addColumn('v0', 'varchar(255)')
      .addColumn('v1', 'varchar(255)')
      .addColumn('v2', 'varchar(255)')
      .addColumn('v3', 'varchar(255)')
      .addColumn('v4', 'varchar(255)')
      .addColumn('v5', 'varchar(255)')
      .execute();
    
    // Unique index to prevent duplicate rules
    try {
      await kdb.schema
        .createIndex('idx_casbin_rule_uniq')
        .ifNotExists()
        .on('casbin_rule')
        .unique()
        .columns(['ptype', 'v0', 'v1', 'v2', 'v3', 'v4', 'v5'])
        .execute();
    } catch {
      // ignore index creation errors
    }

    // Index for fast lookups by ptype and v0
    try {
      await kdb.schema
        .createIndex('idx_casbin_rule_ptype_v0')
        .ifNotExists()
        .on('casbin_rule')
        .columns(['ptype', 'v0'])
        .execute();
    } catch {
      // ignore index creation errors
    }

    console.log('[schema] casbin_rule table created');

    // discord_guild_member - store guild membership and synced Discord roles
    console.log('[schema] Creating discord_guild_member table...');
    await kdb.schema
      .createTable('discord_guild_member')
      .ifNotExists()
      .addColumn('discord_user_id', 'varchar(255)', (col) => col.notNull())
      .addColumn('guild_id', 'varchar(255)', (col) => col.notNull())
      .addColumn('roles_json', 'text')  // JSON array of Discord role IDs
      .addColumn('last_synced_at', 'timestamp', (col) =>
        dbType === 'sqlite'
          ? col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
          : col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
      )
      .execute();
    
    // Composite primary key: (discord_user_id, guild_id)
    try {
      await kdb.schema
        .createIndex('idx_discord_guild_member_pk')
        .ifNotExists()
        .on('discord_guild_member')
        .unique()
        .columns(['discord_user_id', 'guild_id'])
        .execute();
    } catch {
      // ignore if already exists
    }

    console.log('[schema] discord_guild_member table created');

    // admin_discord_mapping - admin UI-managed Discord mappings
    console.log('[schema] Creating admin_discord_mapping table...');
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

    try {
      await kdb.schema
        .createIndex('idx_admin_discord_mapping_scope')
        .ifNotExists()
        .on('admin_discord_mapping')
        .unique()
        .columns(['discord_id_type', 'discord_id', 'target_type'])
        .execute();
    } catch {
      // ignore
    }

    console.log('[schema] admin_discord_mapping table created');

    console.info(`[schema] Schema created or already exists. Using ${dbType.toUpperCase()} database`);
  } catch (err) {
    console.error('[schema] Error creating schema:', err);
    throw err;
  }
}
