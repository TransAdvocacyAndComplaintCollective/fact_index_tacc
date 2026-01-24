import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Kysely, SqliteDialect, sql } from 'kysely';

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

export type DatabaseSchema = {
  users: UsersTable;
  facts: FactsTable;
};

// Determine repository root by walking up until we find workspace indicators
function findRepoRoot(startDir: string): string {
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

const repoRoot = findRepoRoot(__dirname);
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
    throw new Error('Database not yet initialized. Call initializeDb() first.');
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
    // Lazy-load sqlite3 only when needed
    const sqlite3 = await import('sqlite3');
    const { SqliteDriver } = await import('./sqlite-driver.js');
    
    const sqlite = sqlite3.default.verbose();
    const sqliteDb = new sqlite.Database(dbPath);
    
    const driver = new SqliteDriver(sqliteDb);
    
    db = new Kysely<DatabaseSchema>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dialect: new SqliteDialect({ database: driver as any }),
    });
    
    console.log('[db] Database connection established');
  } catch (err) {
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

    console.info('Schema created or already exists. DB path:', dbPath);
  } catch (err) {
    console.error('[schema] Error creating schema:', err);
    throw err;
  }
}


