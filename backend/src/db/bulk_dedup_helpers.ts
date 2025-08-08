// ./backend/src/db/bulk_dedup_helpers.ts
import knex from 'knex';
// types only; this will be erased at compile time
import type { Knex } from 'knex';
import './schema.ts';
import { createFact } from './fact_crud.ts';
type Fact = Awaited<ReturnType<typeof createFact>>;
export interface FactParams {
  fact_text: string;
  source: string;
  type?: string;
  subject?: string;
  audience?: string;
  year?: number | string;
}
import pinologger from '../logger/pino.ts'; // Use .js here for ESM/TS Node import!
import { logQuery } from './logQuery.ts';

const pinolog = pinologger.child({ component: 'bulk_dedup_helpers' });

// Import your knex configuration (adjust the path as needed)
import knexConfig from './knexfile.ts';

const environment = (process.env.NODE_ENV as keyof typeof knexConfig) || 'development';
const db: Knex = knex(knexConfig[environment]);

export interface FactExistsParams {
  fact_text: string;
  source: string;
}

export interface CountFactsParams {
  type?: string;
  subject?: string;
  audience?: string;
  year?: number | string;
}

/**
 * Check if a fact exists by text and source.
 */
export async function factExists({ fact_text, source }: FactExistsParams): Promise<boolean> {
  pinolog.info('factExists called', { fact_text, source });
  try {
    const query = db('facts').where({ fact_text, source }).first();
    const result = await logQuery(query, 'EXISTS fact');
    return !!result;
  } catch (err) {
    pinolog.error('factExists error', { err });
    throw err;
  }
}

/**
 * Bulk-insert facts, skipping duplicates.
 */
export async function bulkInsertFacts(factsArray: FactParams[]): Promise<Fact[]> {
  pinolog.info('bulkInsertFacts called', { factsArrayLength: factsArray.length });
  const inserted: Fact[] = [];
  for (const fact of factsArray) {
    if (!(await factExists({ fact_text: fact.fact_text, source: fact.source }))) {
      inserted.push(await createFact({
        fact_text: fact.fact_text,
        source: fact.source,
        type: fact.type,
        context: '',               // supply a default or real context
        year: typeof fact.year === 'string' ? Number(fact.year) : fact.year,
        user_id: 0,                // supply your system/user id here
        subjects: fact.subject ? [fact.subject] : [],
        audiences: fact.audience ? [fact.audience] : [],
      }));
    } else {
      pinolog.info('bulkInsertFacts: fact already exists, skipping', { fact_text: fact.fact_text });
    }
  }
  pinolog.info('bulkInsertFacts done', { insertedCount: inserted.length });
  return inserted;
}

/**
 * Count facts with optional filters.
 */
export async function countFacts(params: CountFactsParams = {}): Promise<number> {
  try {
    const q = db('facts')
      .leftJoin('fact_subjects', 'facts.id', 'fact_subjects.fact_id')
      .leftJoin('subjects', 'fact_subjects.subject_id', 'subjects.id')
      .leftJoin('fact_target_audiences', 'facts.id', 'fact_target_audiences.fact_id')
      .leftJoin('target_audiences', 'fact_target_audiences.target_audience_id', 'target_audiences.id');
    if (params.type) q.where('facts.type', params.type);
    if (params.subject) q.where('subjects.name', params.subject);
    if (params.audience) q.where('target_audiences.name', params.audience);
    if (params.year) q.where('facts.year', params.year);
    const result = await logQuery(q.countDistinct('facts.id as count'), 'COUNT facts');
    return Number(result[0]?.count ?? 0);
  } catch (err) {
    pinolog.error('countFacts error', { err });
    throw err;
  }
}
