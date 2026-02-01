import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { Kysely, SqliteDialect, sql } from 'kysely';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type UsersTable = {
  id: number;
  discord_name: string | null;
  email: string | null;
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

export type DatabaseSchema = {
  users: UsersTable;
  facts: FactsTable;
  discord_oauth_tokens: DiscordOAuthTokensTable;
  jwt_token_blacklist: JwtTokenBlacklistTable;
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

const repoRoot = findRepoRoot();
const repoRootDbPath = path.join(repoRoot, 'db', 'dev.sqlite3');

// Force the DB to live at <repo_root>/db/dev.sqlite3. This ensures a predictable
// location across dev environments.
const dbPath = repoRootDbPath;
console.info('[db] repoRoot:', repoRoot);
console.info('[db] sqlite path:', dbPath);

// Ensure the parent directory exists so sqlite can create the file there.
try {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
} catch {
  // ignore directory creation errors — sqlite will error later if needed
}

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

  console.log('[db] Initializing database connection...');
  try {
    const sqlite = new Database(dbPath);
    db = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database: sqlite }),
    });

    console.log('[db] Database connection established');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    
    // Check if this is a native binding error
    if (errorMessage.includes('Could not locate the bindings file') || errorMessage.includes('better_sqlite3.node')) {
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

export { db };

export async function createSchema(kdb: Kysely<DatabaseSchema>): Promise<void> {
  try {
    console.log('[schema] Starting schema creation...');
    // users
    console.log('[schema] Creating users table...');
    await kdb.schema
      .createTable('users')
      .ifNotExists()
      .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
      .addColumn('discord_name', 'text')
      .addColumn('email', 'text')
      .execute();
    console.log('[schema] Users table created');

    // subjects
    await kdb.schema
      .createTable('subjects')
      .ifNotExists()
      .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
      .addColumn('name', 'text', (col) => col.notNull().unique())
      .execute();

    // audiences
    await kdb.schema
      .createTable('audiences')
      .ifNotExists()
      .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
      .addColumn('name', 'text', (col) => col.notNull().unique())
      .execute();

    // facts
    console.log('[schema] Creating facts table...');
    await kdb.schema
      .createTable('facts')
      .ifNotExists()
      .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
      .addColumn('timestamp', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('fact_text', 'text', (col) => col.notNull())
      .addColumn('source', 'text')
      .addColumn('type', 'text')
      .addColumn('context', 'text')
      .addColumn('year', 'integer')
      .addColumn('user_id', 'integer', (col) => col.references('users.id').onDelete('set null'))
      .addColumn('suppressed', 'boolean', (col) => col.notNull().defaultTo(false))
      .execute();
    console.log('[schema] Facts table created');

    // discord_oauth_tokens - for persistent OAuth token storage
    console.log('[schema] Creating discord_oauth_tokens table...');
    await kdb.schema
      .createTable('discord_oauth_tokens')
      .ifNotExists()
      .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
      .addColumn('discord_user_id', 'text', (col) => col.notNull().unique())
      .addColumn('access_token', 'text', (col) => col.notNull())
      .addColumn('refresh_token', 'text')
      .addColumn('expires_at', 'integer')
      .addColumn('scope', 'text')
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();
    console.log('[schema] Discord OAuth tokens table created');

    // jwt_token_blacklist - for revoking JWT tokens (logout, security events)
    console.log('[schema] Creating jwt_token_blacklist table...');
    await kdb.schema
      .createTable('jwt_token_blacklist')
      .ifNotExists()
      .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
      .addColumn('token_jti', 'text', (col) => col.notNull().unique())
      .addColumn('discord_user_id', 'text', (col) => col.notNull())
      .addColumn('revoked_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('expires_at', 'integer', (col) => col.notNull())
      .addColumn('reason', 'text')
      .execute();
    console.log('[schema] JWT token blacklist table created');

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

    console.info('Schema created or already exists. DB path:', dbPath);
  } catch (err) {
    console.error('[schema] Error creating schema:', err);
    throw err;
  }
}
