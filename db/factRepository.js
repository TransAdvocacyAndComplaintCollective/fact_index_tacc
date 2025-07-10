// factRepository.js (ESM/Node 22+)

import knex from 'knex';
import knexConfig from './knexfile.js';
import './schema.js';

const environment = process.env.NODE_ENV || 'development';
const db = knex(knexConfig[environment]);

// ---- LOGGING ----
function log(...args) {
    // Comment out next line to disable logging
    console.log(new Date().toISOString(), '[FactRepo]', ...args);
}

// Helper to log query and result
async function logQuery(query, label = "QUERY") {
    try {
        // log(`[${label}] SQL:`, query.toString ? query.toString() : '[no toString available]');
        const res = await query;
        // if (Array.isArray(res)) {
        //     log(`[${label}] RESULT:`, `count=${res.length}`);
        // } else {
        //     log(`[${label}] RESULT:`, res);
        // }
        return res;
    } catch (err) {
        log(`[${label}] ERROR:`, err);
        throw err;
    }
}

// ---- FACT CRUD ----
export async function createFact({
    fact_text,
    source,
    type,
    context,
    year,
    user_id,
    subjects = [],
    audiences = [],
}) {
    log('createFact called', { fact_text, source, type, context, year, user_id, subjects, audiences });
    try {
        const query = db('facts').insert({
            fact_text,
            source,
            type,
            context,
            year: year || null,   // Support undefined/null years
            user_id,
        });
        const [id] = await logQuery(query, 'INSERT fact');
        if (subjects.length) await attachSubjectsToFact(id, subjects);
        if (audiences.length) await attachAudiencesToFact(id, audiences);
        return getFactById(id);
    } catch (err) {
        throw err;
    }
}

export async function getFactById(id) {
    try {
        const query = db('facts')
            .select(
                'facts.*',
                'users.discord_name AS user'
            )
            .leftJoin('users', 'facts.user_id', 'users.id')
            .where('facts.id', id)
            .first();
        const fact = await logQuery(query, 'SELECT fact by ID');
        if (!fact) {
            log('getFactById: fact not found', id);
            return null;
        }
        const subjects = await getSubjectsForFact(id);
        const audiences = await getAudiencesForFact(id);
        return { ...fact, subjects, audiences };
    } catch (err) {
        throw err;
    }
}

export async function listFacts({ type, subject, audience, offset = 0, limit = 50, includeSuppressed = false } = {}) {
    log('listFacts called', { type, subject, audience, offset, limit, includeSuppressed });
    try {
        const q = db('facts')
            .distinct('facts.id')
            .select('facts.*', 'users.discord_name AS user')
            .leftJoin('users', 'facts.user_id', 'users.id')
            .leftJoin('fact_subjects', 'facts.id', 'fact_subjects.fact_id')
            .leftJoin('subjects', 'fact_subjects.subject_id', 'subjects.id')
            .leftJoin('fact_target_audiences', 'facts.id', 'fact_target_audiences.fact_id')
            .leftJoin('target_audiences', 'fact_target_audiences.target_audience_id', 'target_audiences.id');
        if (!includeSuppressed) q.where('facts.suppressed', false);
        if (type) q.where('facts.type', type);
        if (subject) q.where('subjects.name', subject);
        if (audience) q.where('target_audiences.name', audience);

        q.orderBy('facts.timestamp', 'desc').offset(offset).limit(limit);
        const rows = await logQuery(q, 'SELECT facts (list)');
        log('listFacts: rows found', rows.length);
        return Promise.all(rows.map(r => getFactById(r.id)));
    } catch (err) {
        log('listFacts error', err);
        throw err;
    }
}

export async function updateFact(id, changes = {}, subjects, audiences) {
    log('updateFact called', { id, changes, subjects, audiences });
    try {
        if (Object.keys(changes).length > 0) {
            if ('year' in changes && changes.year === undefined) delete changes.year;
            await logQuery(db('facts').where({ id }).update(changes), 'UPDATE fact');
        }
        if (subjects) {
            await logQuery(db('fact_subjects').where({ fact_id: id }).del(), 'DELETE fact_subjects');
            if (subjects.length) await attachSubjectsToFact(id, subjects);
        }
        if (audiences) {
            await logQuery(db('fact_target_audiences').where({ fact_id: id }).del(), 'DELETE fact_target_audiences');
            if (audiences.length) await attachAudiencesToFact(id, audiences);
        }
        return getFactById(id);
    } catch (err) {
        log('updateFact error', err);
        throw err;
    }
}

export async function deleteFact(id) {
    log('deleteFact called', id);
    return db.transaction(async trx => {
        await logQuery(trx('fact_subjects').where({ fact_id: id }).del(), 'DELETE fact_subjects (txn)');
        await logQuery(trx('fact_target_audiences').where({ fact_id: id }).del(), 'DELETE fact_target_audiences (txn)');
        return logQuery(trx('facts').where({ id }).del(), 'DELETE fact (txn)');
    });
}

// ---- BULK & DEDUP HELPERS ----
export async function factExists({ fact_text, source }) {
    log('factExists called', { fact_text, source });
    try {
        const query = db('facts').where({ fact_text, source }).first();
        const result = await logQuery(query, 'EXISTS fact');
        return !!result;
    } catch (err) {
        log('factExists error', err);
        throw err;
    }
}

export async function bulkInsertFacts(factsArray) {
    log('bulkInsertFacts called', { factsArrayLength: factsArray.length });
    const inserted = [];
    for (const fact of factsArray) {
        if (!await factExists({ fact_text: fact.fact_text, source: fact.source })) {
            inserted.push(await createFact(fact));
        } else {
            log('bulkInsertFacts: fact already exists, skipping', fact.fact_text);
        }
    }
    log('bulkInsertFacts done, inserted', inserted.length);
    return inserted;
}

export async function countFacts({ type, subject, audience, year } = {}) {
    try {
        const q = db('facts')
            .leftJoin('fact_subjects', 'facts.id', 'fact_subjects.fact_id')
            .leftJoin('subjects', 'fact_subjects.subject_id', 'subjects.id')
            .leftJoin('fact_target_audiences', 'facts.id', 'fact_target_audiences.fact_id')
            .leftJoin('target_audiences', 'fact_target_audiences.target_audience_id', 'target_audiences.id');
        if (type) q.where('facts.type', type);
        if (subject) q.where('subjects.name', subject);
        if (audience) q.where('target_audiences.name', audience);
        if (year) q.where('facts.year', year);
        const result = await logQuery(q.countDistinct('facts.id as count'), 'COUNT facts');
        return result[0].count;
    } catch (err) {
        log('countFacts error', err);
        throw err;
    }
}

// ---- SUBJECTS HELPERS ----
export async function attachSubjectsToFact(fact_id, subjectNames = []) {
    log('attachSubjectsToFact called', { fact_id, subjectNames });
    const subjectIds = await Promise.all(subjectNames.map(name => upsertSubject(name)));
    const rows = subjectIds.map(subject_id => ({ fact_id, subject_id }));
    if (rows.length) {
        await logQuery(db('fact_subjects').insert(rows), 'INSERT fact_subjects');
    }
}

export async function upsertSubject(name) {
    log('upsertSubject called', name);
    let row = await logQuery(db('subjects').where({ name }).first(), 'SELECT subject');
    if (row) {
        log('upsertSubject exists', row.id);
        return row.id;
    }
    const [id] = await logQuery(db('subjects').insert({ name }), 'INSERT subject');
    log('upsertSubject inserted', id);
    return id;
}

export async function getSubjectsForFact(fact_id) {
    const query = db('subjects')
        .join('fact_subjects', 'subjects.id', 'fact_subjects.subject_id')
        .where('fact_subjects.fact_id', fact_id)
        .select('subjects.name');
    const rows = await logQuery(query, 'SELECT subjects for fact');
    return rows.map(r => r.name);
}

export async function listSubjects() {
    log('listSubjects called');
    return logQuery(db('subjects').select('*').orderBy('name'), 'SELECT subjects');
}

export async function getFactsForSubject(subject_name, opts = {}) {
    log('getFactsForSubject called', subject_name, opts);
    const subject = await logQuery(db('subjects').where({ name: subject_name }).first(), 'SELECT subject by name');
    if (!subject) return [];
    const fact_ids = await logQuery(db('fact_subjects').where({ subject_id: subject.id }).pluck('fact_id'), 'PLUCK fact_ids for subject');
    return Promise.all(fact_ids.map(getFactById));
}

export async function deleteSubject(id) {
    log('deleteSubject called', id);
    await logQuery(db('fact_subjects').where({ subject_id: id }).del(), 'DELETE fact_subjects (by subject)');
    return logQuery(db('subjects').where({ id }).del(), 'DELETE subject');
}

// ---- AUDIENCES HELPERS ----
export async function attachAudiencesToFact(fact_id, audienceNames = []) {
    log('attachAudiencesToFact called', { fact_id, audienceNames });
    const audienceIds = await Promise.all(audienceNames.map(name => upsertAudience(name)));
    const rows = audienceIds.map(target_audience_id => ({ fact_id, target_audience_id }));
    if (rows.length) {
        await logQuery(db('fact_target_audiences').insert(rows), 'INSERT fact_target_audiences');
    }
    log('attachAudiencesToFact done', rows.length);
}

export async function upsertAudience(name) {
    log('upsertAudience called', name);
    let row = await logQuery(db('target_audiences').where({ name }).first(), 'SELECT audience');
    if (row) {
        log('upsertAudience exists', row.id);
        return row.id;
    }
    const [id] = await logQuery(db('target_audiences').insert({ name }), 'INSERT audience');
    log('upsertAudience inserted', id);
    return id;
}

export async function getAudiencesForFact(fact_id) {
    const query = db('target_audiences')
        .join('fact_target_audiences', 'target_audiences.id', 'fact_target_audiences.target_audience_id')
        .where('fact_target_audiences.fact_id', fact_id)
        .select('target_audiences.name');
    const rows = await logQuery(query, 'SELECT audiences for fact');
    return rows.map(r => r.name);
}

export async function listAudiences() {
    return logQuery(db('target_audiences').select('*').orderBy('name'), 'SELECT audiences');
}

export async function getFactsForAudience(audience_name, opts = {}) {
    const audience = await logQuery(db('target_audiences').where({ name: audience_name }).first(), 'SELECT audience by name');
    if (!audience) return [];
    const fact_ids = await logQuery(db('fact_target_audiences').where({ target_audience_id: audience.id }).pluck('fact_id'), 'PLUCK fact_ids for audience');
    return Promise.all(fact_ids.map(getFactById));
}

export async function deleteAudience(id) {
    await logQuery(db('fact_target_audiences').where({ target_audience_id: id }).del(), 'DELETE fact_target_audiences (by audience)');
    return logQuery(db('target_audiences').where({ id }).del(), 'DELETE audience');
}

// ---- USER HELPERS ----
export async function listUsers() {
    return logQuery(db('users').select('*').orderBy('discord_name'), 'SELECT users');
}

export async function findOrCreateUser(discord_name, email = null) {
    let user = await logQuery(db('users').where({ discord_name }).first(), 'SELECT user');
    if (user) {
        log('findOrCreateUser exists', user.id);
        return user;
    }
    const [id] = await logQuery(db('users').insert({ discord_name, email }), 'INSERT user');
    log('findOrCreateUser inserted', id);
    return logQuery(db('users').where({ id }).first(), 'SELECT user by id');
}

// ---- SUPPRESSION HELPERS ----
export async function suppressFact(id, value = true) {
    log('suppressFact called', { id, value });
    await logQuery(db('facts').where({ id }).update({ suppressed: value }), 'UPDATE fact (suppress)');
    return getFactById(id);
}

export async function listSuppressedFacts(opts = {}) {
    log('listSuppressedFacts called', opts);
    return listFacts({ ...opts, includeSuppressed: true }).then(arr => arr.filter(f => f.suppressed));
}

// ---- SEARCH ----
export async function findFacts({
  keyword = '',
  targets = [],
  subjects = [],
  yearFrom,
  yearTo,
  year,
  offset = 0,
  limit = 50,
  includeSuppressed = false,
  subjectsInclude = [],
  subjectsExclude = [],
  audiencesInclude = [],
  audiencesExclude = [],
} = {}) {
  log('findFacts called', {
    keyword, targets, subjects, yearFrom, yearTo, year, offset, limit, includeSuppressed,
    subjectsInclude, subjectsExclude, audiencesInclude, audiencesExclude,
  });

  let q = db('facts')
    .distinct('facts.id')
    .select('facts.*', 'users.discord_name AS user')
    .leftJoin('users', 'facts.user_id', 'users.id')
    .leftJoin('fact_subjects', 'facts.id', 'fact_subjects.fact_id')
    .leftJoin('subjects', 'fact_subjects.subject_id', 'subjects.id')
    .leftJoin('fact_target_audiences', 'facts.id', 'fact_target_audiences.fact_id')
    .leftJoin('target_audiences', 'fact_target_audiences.target_audience_id', 'target_audiences.id');

  // Only unsuppressed, unless requested otherwise
  if (!includeSuppressed) {
    q.where('facts.suppressed', false);
  }

  // Keyword filter (fact_text, source, context)
  if (keyword && keyword.trim() !== '') {
    q.where(function () {
      this.where('facts.fact_text', 'like', `%${keyword}%`)
        .orWhere('facts.source', 'like', `%${keyword}%`)
        .orWhere('facts.context', 'like', `%${keyword}%`);
    });
  }

  // Year filters (exact, or range)
  if (typeof year === 'number' && !isNaN(year)) {
    q.where('facts.year', year);
  } else {
    if (typeof yearFrom === 'number' && !isNaN(yearFrom)) {
      q.where('facts.year', '>=', yearFrom);
    }
    if (typeof yearTo === 'number' && !isNaN(yearTo)) {
      q.where('facts.year', '<=', yearTo);
    }
  }

  // Subjects INCLUDE (at least one of)
  if (subjectsInclude && subjectsInclude.length > 0) {
    q.whereIn('facts.id', function () {
      this.select('fact_subjects.fact_id')
        .from('fact_subjects')
        .leftJoin('subjects', 'fact_subjects.subject_id', 'subjects.id')
        .whereIn('subjects.name', subjectsInclude);
    });
  }

  // Subjects EXCLUDE (none of)
  if (subjectsExclude && subjectsExclude.length > 0) {
    q.whereNotIn('facts.id', function () {
      this.select('fact_subjects.fact_id')
        .from('fact_subjects')
        .leftJoin('subjects', 'fact_subjects.subject_id', 'subjects.id')
        .whereIn('subjects.name', subjectsExclude);
    });
  }

  // Audiences INCLUDE (at least one of)
  if (audiencesInclude && audiencesInclude.length > 0) {
    q.whereIn('facts.id', function () {
      this.select('fact_target_audiences.fact_id')
        .from('fact_target_audiences')
        .leftJoin('target_audiences', 'fact_target_audiences.target_audience_id', 'target_audiences.id')
        .whereIn('target_audiences.name', audiencesInclude);
    });
  }

  // Audiences EXCLUDE (none of)
  if (audiencesExclude && audiencesExclude.length > 0) {
    q.whereNotIn('facts.id', function () {
      this.select('fact_target_audiences.fact_id')
        .from('fact_target_audiences')
        .leftJoin('target_audiences', 'fact_target_audiences.target_audience_id', 'target_audiences.id')
        .whereIn('target_audiences.name', audiencesExclude);
    });
  }

  // LEGACY: filter by single subject/audience (deprecated in favor of include/exclude lists)
  if (subjects && subjects.length > 0) {
    q.whereIn('subjects.name', subjects);
  }
  if (targets && targets.length > 0) {
    q.whereIn('target_audiences.name', targets);
  }

  // Ordering, Pagination
  q.orderBy('facts.timestamp', 'desc').offset(offset).limit(limit);
  try {
    const rows = await logQuery(q, 'FIND facts');
    log('findFacts: rows found', rows.length);
    // Optionally, you can hydrate related data here or just return rows.
    return Promise.all(rows.map(r => getFactById(r.id)));
  } catch (err) {
    log('findFacts error', err);
    throw err;
  }
}


export { db };

// Optionally, also export a "default" object with all functions if you want both styles:
export default {
    createFact,
    getFactById,
    listFacts,
    updateFact,
    deleteFact,
    factExists,
    bulkInsertFacts,
    countFacts,
    attachSubjectsToFact,
    upsertSubject,
    getSubjectsForFact,
    listSubjects,
    getFactsForSubject,
    deleteSubject,
    attachAudiencesToFact,
    upsertAudience,
    getAudiencesForFact,
    listAudiences,
    getFactsForAudience,
    deleteAudience,
    listUsers,
    findOrCreateUser,
    suppressFact,
    listSuppressedFacts,
    findFacts,
    db,
};
