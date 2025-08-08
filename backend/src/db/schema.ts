// ../fact_index_tacc/backend/src/db/schema.ts
import knex from 'knex';
import knexConfig from './knexfile.ts';
import pinologger from '../logger/pino.ts'; // centralized pino logger
import { logQuery } from './logQuery.ts';
import { listFacts ,getFactById } from './fact_crud.ts'; // Adjust import path if needed
import type { FactRecord }         from './fact_crud.ts';
const pinolog = pinologger.child({ component: 'schema' });

const environment = process.env.NODE_ENV || 'development';
const db = knex(knexConfig[environment]);

/**
 * Suppress or unsuppress a fact by id.
 * @param id Fact ID
 * @param value Suppress value (default: true)
 * @returns Updated fact object
 */
export async function suppressFact(id: number, value = true) {
  pinolog.info('suppressFact called', { id, value });
  await logQuery(
    db('facts').where({ id }).update({ suppressed: value }),
    'UPDATE fact (suppress)'
  );
  return getFactById(id);
}

/**
 * List all suppressed facts.
 * @param opts Options
 * @returns Array of suppressed fact objects
 */
export async function listSuppressedFacts(opts: Partial<{ [key: string]: any }> = {}): Promise<FactRecord[]> {
  pinolog.info('listSuppressedFacts called', opts);

  const allFacts = await listFacts({ ...opts, includeSuppressed: true });
  return allFacts.filter(f => f.suppressed);
}

export { db };
