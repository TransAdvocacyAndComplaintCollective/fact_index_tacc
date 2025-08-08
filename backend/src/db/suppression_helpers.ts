import knex from 'knex';
import knexConfig from './knexfile.ts';
import pinologger from '../logger/pino.ts';
import { findFacts, getAudiencesForFact, getSubjectsForFact } from './fact_crud.ts';
import { logQuery } from './logQuery.ts';

const pinolog = pinologger.child({ component: 'suppression_helpers' });

const environment = process.env.NODE_ENV || 'development';
const db = knex(knexConfig[environment]);

// Helper to log queries with pinolog and replay logs
async function logQueryWithPinolog(queryBuilder: Promise<any>, description: string) {
  pinolog.info(`Starting query: ${description}`);
  try {
    const result = await queryBuilder;
    pinolog.info(`Query succeeded: ${description}`, { rowsReturned: Array.isArray(result) ? result.length : undefined });
    return result;
  } catch (err) {
    if (err instanceof Error) {
      pinolog.error(`Query failed: ${description}`, { error: err.message, stack: err.stack });
    } else {
      pinolog.error(`Query failed: ${description}`, { error: String(err) });
    }
    throw err;
  }
}

/**
 * Get a fact by id
 * @param {number} id
 * @returns {Promise<object|null>} fact or null if not found
 */

export async function getFactById(id: number) {
  try {
    const query = db('facts')
      .select('facts.*', 'users.discord_name AS user')
      .leftJoin('users', 'facts.user_id', 'users.id')
      .where('facts.id', id)
      .first();
    const fact = await logQuery(query, 'SELECT fact by ID');
    if (!fact) {
      pinolog.warn('getFactById: fact not found', { id });
      return null;
    }
    let subjects, audiences;
    try {
      subjects = await getSubjectsForFact(id);
    } catch (subjErr) {
      pinolog.error('getFactById error in getSubjectsForFact', { id, subjErr });
      throw subjErr;
    }
    try {
      audiences = await getAudiencesForFact(id);
    } catch (audErr) {
      pinolog.error('getFactById error in getAudiencesForFact', { id, audErr });
      throw audErr;
    }
    return { ...fact, subjects, audiences };
  } catch (err) {
    pinolog.error('getFactById error', { err, id });
    throw err;
  }
}


/**
 * Suppress or unsuppress a fact by id.
 * @param {number} id
 * @param {boolean} [value=true]
 * @returns {Promise<object>} updated fact
 */
export async function suppressFact(id: number, value = true) {
  pinolog.info('suppressFact called', { id, value });

  await logQueryWithPinolog(
    db('facts').where({ id }).update({ suppressed: value }),
    `UPDATE fact set suppressed=${value} where id=${id}`
  );

  return getFactById(id);
}

/**
 * List all suppressed facts.
 * @param {object} [opts={}]
 * @returns {Promise<object[]>}
 */
export async function listSuppressedFacts(opts = {}) {
  pinolog.info('listSuppressedFacts called', opts);

  // Use listFacts with includeSuppressed and filter suppressed = true
  const facts = await listFacts({ ...opts, includeSuppressed: true });
  return facts.filter(fact => fact.suppressed);
}



/**
 * List facts with optional filters.
 * @param {object} opts
 * @returns {Promise<object[]>}
 */
export async function listFacts(opts = {}) {
  pinolog.info('listFacts called', opts);
  return findFacts(opts);
}

export default {
  suppressFact,
  listSuppressedFacts,
  listFacts,
  getFactById,
};
