// backend/src/db/fact_crud.ts
import knexPkg from 'knex';
import type { Knex } from 'knex';
import knexConfig from './knexfile.ts';
import './schema.ts';
import { attachSubjectsToFact } from './subjects_helpers.ts';
import { attachAudiencesToFact } from './audiences_helpers.ts';
import logger from '../logger/pino.ts';
import { logQuery } from './logQuery.ts';

const pinolog = logger.child({ component: 'fact_crud' });
const knex = knexPkg.default ?? knexPkg;
const environment = (process.env.NODE_ENV as keyof typeof knexConfig) || 'development';
const db: Knex = knex(knexConfig[environment]);



export interface FactRecord {
  id: number;
  fact_text: string;
  source: string;
  type?: string;
  context?: string;
  year?: number | null;
  user_id?: number | null;
  timestamp: string;
  suppressed: boolean;
  user?: string;
  subjects?: string[];
  audiences?: string[];
}

export interface FactInput {
  fact_text: string;
  source: string;
  type?: string;
  context?: string;
  year?: number;
  user_id?: number;
  subjects?: string[];
  audiences?: string[];
}



export async function getSubjectsForFact(factId: number): Promise<string[]> {
  try {
    const rows = await db('fact_subjects')
      .join('subjects', 'fact_subjects.subject_id', 'subjects.id')
      .where('fact_subjects.fact_id', factId)
      .select('subjects.name as name');
    return rows.map(r => r.name);
  } catch (err) {
    pinolog.error({ err, factId }, 'getSubjectsForFact error');
    return [];
  }
}

export async function getAudiencesForFact(factId: number): Promise<string[]> {
  try {
    const rows = await db('fact_target_audiences')
      .join('target_audiences', 'fact_target_audiences.target_audience_id', 'target_audiences.id')
      .where('fact_target_audiences.fact_id', factId)
      .select('target_audiences.name as name');
    return rows.map(r => r.name);
  } catch (err) {
    pinolog.error({ err, factId }, 'getAudiencesForFact error');
    return [];
  }
}

export async function createFact(input: FactInput): Promise<FactRecord> {
  const {
    fact_text,
    source,
    type = null,
    context = null,
    year = null,
    user_id = null,
    subjects = [],
    audiences = []
  } = input;
  pinolog.info({ fact_text, source }, 'createFact called');
  const ids = await logQuery(
    db('facts')
      .insert({ fact_text, source, type, context, year, user_id })
      .returning('id'),
    'INSERT fact'
  );
  const id = ids[0];
  if (subjects.length) await attachSubjectsToFact(id, subjects);
  if (audiences.length) await attachAudiencesToFact(id, audiences);
  const fact = await getFactById(id);
  if (!fact) throw new Error(`Fact with id ${id} not found after insert`);
  return fact;
}

export async function getFactById(id: number): Promise<FactRecord | null> {
  const row = await logQuery(
    db('facts')
      .select('facts.*', 'users.discord_name')
      .leftJoin('users', 'facts.user_id', 'users.id')
      .where('facts.id', id)
      .first(),
    'SELECT fact by ID'
  );
  if (!row) return null;
  const subjects = await getSubjectsForFact(id);
  const audiences = await getAudiencesForFact(id);
  return {
    id: row.id,
    fact_text: row.fact_text,
    source: row.source,
    type: row.type,
    context: row.context,
    year: row.year,
    user_id: row.user_id,
    timestamp: row.timestamp,
    suppressed: row.suppressed,
    user: row.discord_name ?? undefined,
    subjects,
    audiences
  };
}

export async function listFacts(options: {
  type?: string;
  subject?: string;
  audience?: string;
  offset?: number;
  limit?: number;
  includeSuppressed?: boolean;
} = {}): Promise<FactRecord[]> {
  const {
    type,
    subject,
    audience,
    offset = 0,
    limit = 50,
    includeSuppressed = false
  } = options;
  pinolog.info({ options }, 'listFacts called');
  let query = db('facts')
    .distinct('facts.id')
    .select('facts.*', 'users.discord_name')
    .leftJoin('users', 'facts.user_id', 'users.id');
  if (!includeSuppressed) query = query.where('facts.suppressed', false);
  if (type) query = query.where('facts.type', type);
  if (subject)
    query = query
      .join('fact_subjects', 'facts.id', 'fact_subjects.fact_id')
      .join('subjects', 'fact_subjects.subject_id', 'subjects.id')
      .where('subjects.name', subject);
  if (audience)
    query = query
      .join('fact_target_audiences', 'facts.id', 'fact_target_audiences.fact_id')
      .join('target_audiences', 'fact_target_audiences.target_audience_id', 'target_audiences.id')
      .where('target_audiences.name', audience);
  const rows = await logQuery(
    query.limit(limit).offset(offset), 'SELECT facts (list)');
  const results: FactRecord[] = [];
  for (const r of rows) {
    const fact = await getFactById(r.id);
    if (fact) results.push(fact);
  }
  return results;
}

export async function updateFact(
  id: number,
  changes: Partial<Omit<FactInput, 'subjects' | 'audiences'>>,
  subjects?: string[],
  audiences?: string[]
): Promise<FactRecord | null> {
  pinolog.info({ id, changes }, 'updateFact called');
  await db.transaction(async trx => {
    if (Object.keys(changes).length) {
      const data = { ...changes };
      delete (data as any).subjects;
      delete (data as any).audiences;
      await logQuery(trx('facts').where({ id }).update(data as any), 'UPDATE fact');
    }
    if (subjects) {
      await trx('fact_subjects').where({ fact_id: id }).del();
      if (subjects.length) await attachSubjectsToFact(id, subjects);
    }
    if (audiences) {
      await trx('fact_target_audiences').where({ fact_id: id }).del();
      if (audiences.length) await attachAudiencesToFact(id, audiences);
    }
  });
  return getFactById(id);
}

export async function deleteFact(id: number): Promise<void> {
  pinolog.info({ id }, 'deleteFact called');
  await db.transaction(async trx => {
    await trx('fact_subjects').where({ fact_id: id }).del();
    await trx('fact_target_audiences').where({ fact_id: id }).del();
    await trx('facts').where({ id }).del();
  });
}

export async function findFacts(
  filters: {
    keyword?: string;
    yearFrom?: number;
    yearTo?: number;
    year?: number;
    subjectsInclude?: string[];
    subjectsExclude?: string[];
    audiencesInclude?: string[];
    audiencesExclude?: string[];
    sortBy?: 'date' | 'year' | 'name' | 'relevance';
    sortOrder?: 'asc' | 'desc';
    offset?: number;
    limit?: number;
    includeSuppressed?: boolean;
  } = {}
): Promise<FactRecord[]> {
  const {
    keyword = '',
    yearFrom,
    yearTo,
    year,
    subjectsInclude = [],
    subjectsExclude = [],
    audiencesInclude = [],
    audiencesExclude = [],
    sortBy = 'date',
    sortOrder = 'desc',
    offset = 0,
    limit = 50,
    includeSuppressed = false
  } = filters;
  pinolog.info({ filters }, 'findFacts called');
  let query = db('facts').select('facts.id', 'facts.*', 'users.discord_name')
    .leftJoin('users', 'facts.user_id', 'users.id');
  if (!includeSuppressed) query = query.where('facts.suppressed', false);
  if (keyword) query = query.where('facts.fact_text', 'like', `%${keyword}%`);
  if (typeof year === 'number') query = query.where('facts.year', year);
  if (typeof yearFrom === 'number') query = query.where('facts.year', '>=', yearFrom);
  if (typeof yearTo === 'number') query = query.where('facts.year', '<=', yearTo);
  if (subjectsInclude.length) query = query.whereIn('facts.id', function () {
    this.select('fact_subjects.fact_id').from('fact_subjects')
      .join('subjects', 'fact_subjects.subject_id', 'subjects.id')
      .whereIn('subjects.name', subjectsInclude);
  });
  if (subjectsExclude.length) query = query.whereNotIn('facts.id', function () {
    this.select('fact_subjects.fact_id').from('fact_subjects')
      .join('subjects', 'fact_subjects.subject_id', 'subjects.id')
      .whereIn('subjects.name', subjectsExclude);
  });
  if (audiencesInclude.length) query = query.whereIn('facts.id', function () {
    this.select('fact_target_audiences.fact_id').from('fact_target_audiences')
      .join('target_audiences', 'fact_target_audiences.target_audience_id', 'target_audiences.id')
      .whereIn('target_audiences.name', audiencesInclude);
  });
  if (audiencesExclude.length) query = query.whereNotIn('facts.id', function () {
    this.select('fact_target_audiences.fact_id').from('fact_target_audiences')
      .join('target_audiences', 'fact_target_audiences.target_audience_id', 'target_audiences.id')
      .whereIn('target_audiences.name', audiencesExclude);
  });
  const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';
  switch (sortBy) {
    case 'year':
      query = query.orderBy('facts.year', orderDir).orderBy('facts.timestamp', 'desc');
      break;
    case 'name':
      query = query.orderBy('facts.fact_text', orderDir).orderBy('facts.timestamp', 'desc');
      break;
    case 'relevance':
      query = query.orderByRaw(
        `(CASE WHEN facts.fact_text LIKE ? THEN 1 ELSE 0 END) ${orderDir}`,
        [`%${keyword}%`]
      ).orderBy('facts.timestamp', 'desc');
      break;
    default:
      query = query.orderBy('facts.timestamp', orderDir);
  }
  query = query.offset(offset!).limit(limit!);
  const rows = await logQuery(query, 'findFacts');
  const results: FactRecord[] = [];
  for (const r of rows) {
    const fact = await getFactById(r.id);
    if (fact) results.push(fact);
  }
  return results;
}
