// ../fact_index_tacc/backend/src/db/subjects_helpers.js
import knex from 'knex';
import knexConfig from './knexfile.ts';
import {
  getFactById,
  listFacts,
} from './fact_crud.ts';
import pinologger from '../logger/pino.ts'; // centralized pino logger
import { logQuery } from './logQuery.ts'; // Assuming logQuery is a utility function for logging queries
const pinolog = pinologger.child({ component: 'subjects_helpers' });

const environment = process.env.NODE_ENV || 'development';
const db = knex(knexConfig[environment]);

// ---- suppression helpers ----
export async function suppressFact(id: number, value: boolean = true) {
  pinolog.info('suppressFact called', { id, value });
  await logQuery(db('facts').where({ id }).update({ suppressed: value }), 'UPDATE fact (suppress)');
  return getFactById(id);
}
export async function listSuppressedFacts(opts = {}) {
  pinolog.info('listSuppressedFacts called', opts);
  return listFacts({ ...opts, includeSuppressed: true }).then(arr => arr.filter(f => f.suppressed));
}
/**
 * Delete a subject and all associations by subject id.
 * @param {number} id - Subject ID to delete
 * @returns {Promise<number>} Number of rows deleted from subjects table
 */
export async function deleteSubject(id: number) {
  pinolog.info('deleteSubject called', { id });

  // Delete all fact-subject associations first to avoid FK constraint errors
  await logQuery(
    db('fact_subjects').where({ subject_id: id }).del(),
    'DELETE fact_subjects (by subject)'
  );

  // Then delete the subject itself
  const deletedCount = await logQuery(
    db('subjects').where({ id }).del(),
    'DELETE subject'
  );

  pinolog.info('deleteSubject done', { deletedCount });
  return deletedCount;
}
/**
 * List all subjects ordered by name.
 * @returns {Promise<object[]>} Array of subject objects
 */
export async function listSubjects() {
  pinolog.info('listSubjects called');
  return logQuery(db('subjects').select('*').orderBy('name'), 'SELECT subjects');
}

/**
 * Insert a new subject or return existing one by name.
 * @param {string} name - Subject name
 * @returns {Promise<number>} The subject ID
 */
export async function upsertSubject(name: string) {
  pinolog.info('upsertSubject called', { name });

  // Check if subject exists
  const existing = await logQuery(
    db('subjects').where({ name }).first(),
    'SELECT subject'
  );

  if (existing) {
    pinolog.info('upsertSubject exists', { id: existing.id });
    return existing.id;
  }

  // Insert new subject and return its id (PostgreSQL returning syntax)
  const [id] = await logQuery(
    db('subjects').insert({ name }).returning('id'),
    'INSERT subject'
  );

  pinolog.info('upsertSubject inserted', { id });
  return id;
}
/**
 * Attach multiple subjects by name to a fact.
 * @param {number} fact_id
 * @param {string[]} subjectNames
 * @returns {Promise<void>}
 */

export async function attachSubjectsToFact(fact_id: number, subjectNames :string[]) {
  pinolog.info('attachSubjectsToFact called', { fact_id, subjectNames });

  if (!Array.isArray(subjectNames) || subjectNames.length === 0) {
    pinolog.info('No subjects to attach');
    return;
  }

  // Insert (or get) subject IDs for each subject name
  const subjectIds = await Promise.all(subjectNames.map(name => upsertSubject(name)));

  // Prepare association rows
  const rows = subjectIds.map(subject_id => ({ fact_id, subject_id }));

  if (rows.length > 0) {
    await logQuery(
      db('fact_subjects').insert(rows),
      'INSERT fact_subjects'
    );
  }

  pinolog.info('attachSubjectsToFact done', { insertedCount: rows.length });
}

export async function getFactsForSubject(subject_name: string, opts = {}) {
  pinolog.info('getFactsForSubject called', { subject_name, opts });

  // Find the subject by name
  const subject = await logQuery(
    db('subjects').where({ name: subject_name }).first(),
    'SELECT subject by name'
  );

  if (!subject) {
    pinolog.info('Subject not found', { subject_name });
    return [];
  }

  // Get all fact_ids associated with this subject
  const fact_ids = await logQuery(
    db('fact_subjects').where({ subject_id: subject.id }).pluck('fact_id'),
    'PLUCK fact_ids for subject'
  );

  // Fetch each fact by id (includes subjects/audiences thanks to getFactById)
  const facts = await Promise.all(fact_ids.map(getFactById));
  return facts;
}

export { db };