// backend/db/schema/createIndexes.ts

import type { Knex } from 'knex';

export default async function createIndexes(db: Knex): Promise<void> {
  // Indexes for faster lookups
  try { await db.schema.raw('CREATE INDEX IF NOT EXISTS idx_facts_timestamp ON facts(timestamp);'); } catch {}
  try { await db.schema.raw('CREATE INDEX IF NOT EXISTS idx_facts_type ON facts(type);'); } catch {}
  try { await db.schema.raw('CREATE INDEX IF NOT EXISTS idx_subjects_name ON subjects(name);'); } catch {}
  try { await db.schema.raw('CREATE INDEX IF NOT EXISTS idx_target_audiences_name ON target_audiences(name);'); } catch {}
}
