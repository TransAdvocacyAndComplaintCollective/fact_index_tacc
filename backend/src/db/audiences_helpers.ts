// backend/src/db/audiences_helpers.ts

import knexPkg from "knex";
const knex = knexPkg.default ?? knexPkg;
type Knex = import("knex").Knex;

import knexConfig from "./knexfile.ts";

import pinologger from "../logger/pino.ts"; // Use .js import for ESM TypeScript node resolution
import { logQuery } from "./logQuery.ts";
import { getFactById } from "./fact_crud.ts";

const pinolog = pinologger.child({ component: "audiences_helpers" });

const environment = (process.env.NODE_ENV ||
  "development") as keyof typeof knexConfig;
const db: Knex = knex(knexConfig[environment]);

/**
 * Attach multiple audiences by name to a fact.
 */
export async function attachAudiencesToFact(
  fact_id: number,
  audienceNames: string[] = []
): Promise<void> {
  pinolog.info("attachAudiencesToFact called", { fact_id, audienceNames });

  if (!Array.isArray(audienceNames) || audienceNames.length === 0) {
    pinolog.info("No audiences to attach");
    return;
  }

  const audienceIds: number[] = await Promise.all(
    audienceNames.map((name) => upsertAudience(name))
  );

  const rows = audienceIds.map((target_audience_id) => ({
    fact_id,
    target_audience_id,
  }));

  if (rows.length > 0) {
    await logQuery(
      db("fact_target_audiences").insert(rows),
      "INSERT fact_target_audiences"
    );
  }

  pinolog.info("attachAudiencesToFact done", { insertedCount: rows.length });
}

/**
 * Insert or get existing audience by name.
 */
export async function upsertAudience(name: string): Promise<number> {
  pinolog.info("upsertAudience called", { name });

  const row = await logQuery(
    db("target_audiences").where({ name }).first(),
    "SELECT audience"
  );

  if (row) {
    pinolog.info("upsertAudience exists", { id: row.id });
    return row.id;
  }

  // Insert audience and get inserted id (PostgreSQL)
  const result = await logQuery(
    db("target_audiences").insert({ name }).returning("id"),
    "INSERT audience"
  );

  // PostgreSQL returns an array of objects: [{id: ...}]
  const id =
    Array.isArray(result) && result.length > 0
      ? (result[0] as { id: number }).id
      : typeof result === "number"
        ? result
        : undefined;

  pinolog.info("upsertAudience inserted", { id });
  return id as number;
}

/**
 * Get audience names associated with a fact.
 */
export async function getAudiencesForFact(fact_id: number): Promise<string[]> {
  const query = db("target_audiences")
    .join(
      "fact_target_audiences",
      "target_audiences.id",
      "fact_target_audiences.target_audience_id"
    )
    .where("fact_target_audiences.fact_id", fact_id)
    .select<{ name: string }[]>("target_audiences.name");

  const rows = await logQuery(
    query,
    "SELECT audiences for fact"
  );
  return rows.map((r: { name: string }) => r.name);
}

/**
 * List all audiences ordered by name.
 */
export async function listAudiences(): Promise<{ id: number; name: string }[]> {
  pinolog.info("listAudiences called");
  return logQuery(
    db("target_audiences").select("*").orderBy("name"),
    "SELECT audiences"
  );
}

/**
 * Get facts associated with an audience by audience name.
 */
export async function getFactsForAudience(
  audience_name: string,
  opts: Record<string, unknown> = {}
): Promise<unknown[]> {
  pinolog.info("getFactsForAudience called", { audience_name, opts });

  const audience = await logQuery(
    db("target_audiences").where({ name: audience_name }).first(),
    "SELECT audience by name"
  );

  if (!audience) {
    pinolog.info("Audience not found", { audience_name });
    return [];
  }

  const fact_ids = await logQuery(
    db("fact_target_audiences")
      .where({ target_audience_id: audience.id })
      .pluck("fact_id"),
    "PLUCK fact_ids for audience"
  );

  const facts = await Promise.all(fact_ids.map(getFactById));
  return facts;
}

/**
 * Delete an audience and its associations by audience id.
 */
export async function deleteAudience(id: number): Promise<number> {
  pinolog.info("deleteAudience called", { id });

  // Delete fact-audience links first
  await logQuery(
    db("fact_target_audiences").where({ target_audience_id: id }).del(),
    "DELETE fact_target_audiences (by audience)"
  );

  // Delete the audience
  const deletedCount = await logQuery(
    db("target_audiences").where({ id }).del(),
    "DELETE audience"
  );

  pinolog.info("deleteAudience done", { deletedCount });
  return deletedCount;
}
