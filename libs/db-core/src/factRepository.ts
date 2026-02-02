import { createSchema, db } from './dbClient.ts';
import type { Fact, NewFactInput } from '@factdb/types';
import type { DatabaseSchema } from './dbClient.ts';

type NameRow = {
  id: number;
  name: string;
};

function isSqliteError(err: unknown): err is { code?: string; message?: string } {
  return Boolean(
    typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      'message' in err &&
      typeof (err as { code?: unknown }).code === 'string' &&
      typeof (err as { message?: unknown }).message === 'string',
  );
}

function isSqliteMissingTable(err: unknown): boolean {
  return isSqliteError(err) && err.message?.includes('no such table');
}

let _schemaEnsured = false;
async function ensureSchemaOnce() {
  if (_schemaEnsured) return;
  await createSchema(db);
  _schemaEnsured = true;
}

const trueValue = 1;
const falseValue = 0;
const toDbBoolean = (val?: boolean | null): 0 | 1 | null => {
  if (val === null || val === undefined) return null;
  return val ? trueValue : falseValue;
};

const normalizeValues = (values?: (string | null | undefined)[]): string[] => {
  if (!values) return [];
  const normalized = values
    .filter((val): val is string => typeof val === 'string')
    .map((val) => val.trim())
    .filter((val) => val.length > 0);
  return [...new Map(normalized.map((val) => [val.toLowerCase(), val])).values()];
};

async function ensureLookupRows(table: 'subjects' | 'audiences', names: string[]): Promise<NameRow[]> {
  const uniqueNames = normalizeValues(names);
  if (!uniqueNames.length) return [];
  await db
    .insertInto(table)
    .values(uniqueNames.map((name) => ({ name })))
    .onConflict((oc) => oc.column('name').doNothing())
    .execute();
  const rows = await db
    .selectFrom(table)
    .select(['id', 'name'])
    .where('name', 'in', uniqueNames)
    .execute();
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

async function attachFactLookup(
  factId: number,
  names: string[],
  table: 'subjects' | 'audiences',
  joinTable: 'fact_subjects' | 'fact_audiences',
  joinColumn: 'subject_id' | 'audience_id',
): Promise<string[]> {
  const inserted = await ensureLookupRows(table, names);
  if (!inserted.length) return [];
  await db
    .insertInto(joinTable)
    .values(
      inserted.map((row) => ({
        fact_id: factId,
        [joinColumn]: row.id,
      })),
    )
    .onConflict((oc) => oc.columns(['fact_id', joinColumn]).doNothing())
    .execute();
  return inserted.map((row) => row.name);
}

async function clearFactLookup(factId: number, joinTable: 'fact_subjects' | 'fact_audiences') {
  await db
    .deleteFrom(joinTable)
    .where('fact_id', '=', factId)
    .execute();
}

async function loadFactRelations(
  factIds: number[],
  joinTable: 'fact_subjects' | 'fact_audiences',
): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (!factIds.length) return map;
  let rows: { fact_id: number; name: string }[];
  if (joinTable === 'fact_subjects') {
    rows = await db
      .selectFrom('fact_subjects')
      .innerJoin('subjects', 'subjects.id', 'fact_subjects.subject_id')
      .select([
        'fact_subjects.fact_id as fact_id',
        'subjects.name as name',
      ] as const)
      .where('fact_subjects.fact_id', 'in', factIds)
      .execute();
  } else {
    rows = await db
      .selectFrom('fact_audiences')
      .innerJoin('audiences', 'audiences.id', 'fact_audiences.audience_id')
      .select([
        'fact_audiences.fact_id as fact_id',
        'audiences.name as name',
      ] as const)
      .where('fact_audiences.fact_id', 'in', factIds)
      .execute();
  }
  for (const row of rows) {
    const existing = map.get(row.fact_id) ?? [];
    existing.push(row.name);
    map.set(row.fact_id, existing);
  }
  return map;
}

const toFactWithRelations = async (rows: (DatabaseSchema['facts'] & { suppressed: number | boolean | null })[]) => {
  const factIds = rows.map((r) => r.id);
  const subjectMap = await loadFactRelations(factIds, 'fact_subjects');
  const audienceMap = await loadFactRelations(factIds, 'fact_audiences');
  return rows.map((row) => {
    const subjects = subjectMap.get(row.id) ?? [];
    const audiences = audienceMap.get(row.id) ?? [];
    return {
      ...row,
      suppressed: !!row.suppressed,
      subjects,
      audiences,
      subject: subjects[0] ?? row.type ?? null,
    };
  });
};

export async function findFacts(opts: { keyword?: string } = {}): Promise<Fact[]> {
  const { keyword } = opts;
  try {
    let q = db.selectFrom('facts').selectAll().orderBy('timestamp', 'desc').limit(100);
    q = q.where('suppressed', '=', falseValue);
    if (keyword) {
      const like = `%${keyword}%`;
      q = q.where((eb) =>
        eb.or([
          eb('fact_text', 'like', like),
          eb('source', 'like', like),
          eb('context', 'like', like),
        ]),
      );
    }
    const rows = await q.execute();
    return toFactWithRelations(rows);
  } catch (err: unknown) {
    if (isSqliteMissingTable(err)) {
      await ensureSchemaOnce();
      return findFacts(opts);
    }
    throw err;
  }
}

export async function getFactById(id: number): Promise<Fact | undefined> {
  try {
    const row = await db.selectFrom('facts').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) return undefined;
    const [fact] = await toFactWithRelations([row]);
    return fact;
  } catch (err: unknown) {
    if (isSqliteMissingTable(err)) {
      await ensureSchemaOnce();
      return getFactById(id);
    }
    throw err;
  }
}

export async function createFact(input: NewFactInput): Promise<Fact> {
  const insert = {
    fact_text: input.fact_text,
    source: input.source ?? null,
    type: input.type ?? null,
    context: input.context ?? null,
    year: input.year ?? null,
    user_id: input.user_id ?? null,
    suppressed: toDbBoolean(input.suppressed ?? false),
  };
  try {
    const insertResult = await db.insertInto('facts').values(insert).executeTakeFirst();
    const factId = insertResult?.insertId;
    if (!factId) throw new Error('Could not insert fact');
    const insertedId = Number(factId);
    await attachFactLookup(insertedId, input.subjects ?? [], 'subjects', 'fact_subjects', 'subject_id');
    await attachFactLookup(insertedId, input.audiences ?? [], 'audiences', 'fact_audiences', 'audience_id');
    const created = await getFactById(insertedId);
    if (!created) throw new Error('Could not retrieve created fact');
    return created;
  } catch (err: unknown) {
    if (isSqliteMissingTable(err)) {
      await ensureSchemaOnce();
      return createFact(input);
    }
    throw err;
  }
}

export async function updateFact(id: number, changes: Partial<NewFactInput>): Promise<void> {
  const up: Partial<DatabaseSchema['facts']> = {};
  if (changes.fact_text !== undefined) up.fact_text = changes.fact_text;
  if (changes.source !== undefined) up.source = changes.source;
  if (changes.type !== undefined) up.type = changes.type;
  if (changes.context !== undefined) up.context = changes.context;
  if (changes.year !== undefined) up.year = changes.year;
  if (changes.user_id !== undefined) up.user_id = changes.user_id;
  if (changes.suppressed !== undefined) up.suppressed = toDbBoolean(changes.suppressed);
  if (changes.subjects) {
    await clearFactLookup(id, 'fact_subjects');
    await attachFactLookup(id, changes.subjects, 'subjects', 'fact_subjects', 'subject_id');
  }
  if (changes.audiences) {
    await clearFactLookup(id, 'fact_audiences');
    await attachFactLookup(id, changes.audiences, 'audiences', 'fact_audiences', 'audience_id');
  }

  if (Object.keys(up).length === 0) return;
  try {
    await db.updateTable('facts').set(up).where('id', '=', id).execute();
  } catch (err: unknown) {
    if (isSqliteMissingTable(err)) {
      await ensureSchemaOnce();
      return updateFact(id, changes);
    }
    throw err;
  }
}

export async function deleteFact(id: number): Promise<void> {
  try {
    await db.deleteFrom('facts').where('id', '=', id).execute();
  } catch (err: unknown) {
    if (isSqliteError(err) && err.code === 'SQLITE_ERROR' && String(err.message).includes('no such table')) {
      await ensureSchemaOnce();
      return deleteFact(id);
    }
    throw err;
  }
}

function dedupeDisplayValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }
  return result;
}

export async function listSubjects(): Promise<string[]> {
  const rows = await db
    .selectFrom('subjects')
    .innerJoin('fact_subjects', 'fact_subjects.subject_id', 'subjects.id')
    .innerJoin('facts', 'facts.id', 'fact_subjects.fact_id')
    .select(['subjects.name as name'])
    .where('facts.suppressed', '=', falseValue)
    .orderBy('subjects.name')
    .execute();

  return dedupeDisplayValues(rows.map((r) => r.name));
}

export async function listAudiences(): Promise<string[]> {
  const rows = await db
    .selectFrom('audiences')
    .innerJoin('fact_audiences', 'fact_audiences.audience_id', 'audiences.id')
    .innerJoin('facts', 'facts.id', 'fact_audiences.fact_id')
    .select(['audiences.name as name'])
    .where('facts.suppressed', '=', falseValue)
    .orderBy('audiences.name')
    .execute();

  return dedupeDisplayValues(rows.map((r) => r.name));
}
