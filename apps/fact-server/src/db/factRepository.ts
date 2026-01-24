import { db } from './schema.ts'
import { sql } from 'kysely'
import { createSchema } from './schema.ts'

let _schemaEnsured = false
async function ensureSchemaOnce() {
  if (_schemaEnsured) return
  try {
    await createSchema(db)
    _schemaEnsured = true
  } catch (err) {
    // Allow callers to receive the original error if schema creation fails
    throw err
  }
}

// Ensure schema exists as early as possible to avoid race conditions where
// other modules execute queries before `createSchema` is awaited in main.ts.
// NOTE: Do not call `ensureSchemaOnce()` at module import time here. The
// application startup (`main.ts`) is responsible for ensuring the schema
// is created before mounting routers that may run queries. Keeping schema
// creation centralized avoids race conditions around module import order.

export type Fact = {
  id: number
  timestamp: string
  fact_text: string
  source: string | null
  type: string | null
  context: string | null
  year: number | null
  user_id: number | null
  suppressed: boolean
}

type NewFactInput = Partial<Pick<Fact, 'fact_text' | 'source' | 'type' | 'context' | 'year' | 'user_id' | 'suppressed'>> & { fact_text: string }

/**
 * Find facts with optional keyword search (fact_text, source, context), newest first.
 */
export async function findFacts(opts: { keyword?: string | undefined } = {}): Promise<Fact[]> {
  const { keyword } = opts
  try {
    let q = db.selectFrom('facts').selectAll().orderBy('timestamp', 'desc').limit(100)
    // Exclude suppressed facts by default
    q = q.where('suppressed', '=', false)
    if (keyword) {
      const like = `%${keyword}%`
      // Grouped OR condition via raw SQL to avoid ExpressionBuilder typing issues
      // The SQL raw is cast to any to satisfy Kysely's typing for this grouped condition.
      q = q.where(sql`(fact_text LIKE ${like} OR source LIKE ${like} OR context LIKE ${like})` as any)
    }
    const rows = await q.execute()
    return rows.map((r) => ({ ...r, suppressed: !!r.suppressed }))
  } catch (err: any) {
    if (err && err.code === 'SQLITE_ERROR' && String(err.message).includes('no such table')) {
      await ensureSchemaOnce()
      return findFacts(opts)
    }
    throw err
  }
}

export async function getFactById(id: number): Promise<Fact | undefined> {
  try {
    const row = await db.selectFrom('facts').selectAll().where('id', '=', id).executeTakeFirst()
    if (!row) return undefined
    return { ...row, suppressed: !!row.suppressed }
  } catch (err: any) {
    if (err && err.code === 'SQLITE_ERROR' && String(err.message).includes('no such table')) {
      await ensureSchemaOnce()
      return getFactById(id)
    }
    throw err
  }
}

export async function createFact(input: NewFactInput): Promise<Fact> {
  // Ensure required fields and defaults
  const insert = {
    fact_text: input.fact_text,
    source: input.source ?? null,
    type: input.type ?? null,
    context: input.context ?? null,
    year: input.year ?? null,
    user_id: input.user_id ?? null,
    suppressed: input.suppressed ?? false,
  }
  try {
    await db.insertInto('facts').values(insert).execute()
    // return the newly created row
    const created = await db.selectFrom('facts').selectAll().orderBy('id', 'desc').limit(1).executeTakeFirst()
    if (!created) throw new Error('Could not retrieve created fact')
    return { ...created, suppressed: !!created.suppressed }
  } catch (err: any) {
    if (err && err.code === 'SQLITE_ERROR' && String(err.message).includes('no such table')) {
      await ensureSchemaOnce()
      return createFact(input)
    }
    throw err
  }
}

export async function updateFact(id: number, changes: Partial<NewFactInput>): Promise<void> {
  const up: any = {}
  if (changes.fact_text !== undefined) up.fact_text = changes.fact_text
  if (changes.source !== undefined) up.source = changes.source
  if (changes.type !== undefined) up.type = changes.type
  if (changes.context !== undefined) up.context = changes.context
  if (changes.year !== undefined) up.year = changes.year
  if (changes.user_id !== undefined) up.user_id = changes.user_id
  if (changes.suppressed !== undefined) up.suppressed = changes.suppressed

  if (Object.keys(up).length === 0) return
  try {
    await db.updateTable('facts').set(up).where('id', '=', id).execute()
  } catch (err: any) {
    if (err && err.code === 'SQLITE_ERROR' && String(err.message).includes('no such table')) {
      await ensureSchemaOnce()
      return updateFact(id, changes)
    }
    throw err
  }
}

export async function deleteFact(id: number): Promise<void> {
  try {
    await db.deleteFrom('facts').where('id', '=', id).execute()
  } catch (err: any) {
    if (err && err.code === 'SQLITE_ERROR' && String(err.message).includes('no such table')) {
      await ensureSchemaOnce()
      return deleteFact(id)
    }
    throw err
  }
}

/**
 * Return distinct subject values (from `type`) for UI filters.
 */
export async function listSubjects(): Promise<string[]> {
  const rows = await db
    .selectFrom('facts')
    .select(['type'])
    .where(sql`type IS NOT NULL` as any)
    .where('suppressed', '=', false)
    .distinct()
    .orderBy('type')
    .execute()

  return rows.map((r) => String(r.type));
}

/**
 * Return distinct audience values (from `context`) for UI filters.
 */
export async function listAudiences(): Promise<string[]> {
  const rows = await db
    .selectFrom('facts')
    .select(['context'])
    .where(sql`context IS NOT NULL` as any)
    .where('suppressed', '=', false)
    .distinct()
    .orderBy('context')
    .execute()

  return rows.map((r) => String(r.context));
}

