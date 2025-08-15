// src/scripts/loadFactsCsv.ts
import * as path from "node:path";
import * as fs from "node:fs";
import { parse } from "csv-parse";
import { DataSource } from "typeorm";
import { AudienceModel, FactModel, SubjectModel } from "./lib/db/fact/type.js";
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity.js";
import 'reflect-metadata';
// Adjust to your existing data-source config:
export const AppDataSource = new DataSource({
  type: "sqlite",
  database: path.resolve("./data2.sqlite"),
  entities: [FactModel, SubjectModel,AudienceModel],

  synchronize: false, // use migrations in prod; can flip to true in dev
  logging: false,
});

// CSV header mapping (exact column titles from your sample):
const COLS = {
  timestamp: "Timestamp",
  text: "Fact / Evidence/Quote (Please keep this as short as possible whilst being accurate)",
  source: "Source (If no URL upload to drive and extract URL )",
  type: "Type : Facts or Evidence?",
  subjects:
    'Subject (If you want to add more that one other tag, please do so in this format under the other option: "Subject_01, Subject_02, Subject_03 "',
  audience: "Target Audience (who will want to know this)",
  context: "Context",
  name: "Discord Name or First / Last Name or Group Name",
  email: "Email address",
} as const;

export type RecordType = "Fact" | "Evidence" | "Quote";

function parseRecordType(raw: string): RecordType {
  const s = (raw || "").toLowerCase();
  if (s.includes("quote")) return "Quote";
  if (s.includes("evidence")) return "Evidence";
  return "Fact";
}

function parseSubjects(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.replace(/^["“”']|["“”']$/g, "")) // strip fancy quotes
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseUkDateTime(raw: string): Date {
  const m = raw?.match(
    /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/
  );
  if (!m) return new Date(raw); // fallback
  const [, dd, mm, yyyy, HH, MM, SS] = m;
  return new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(HH),
    Number(MM),
    Number(SS)
  );
}

async function run() {
  // Take CSV path from CLI arg or default to the old path
  const csvArg = process.argv[2];
  const csvPath = path.resolve(
    csvArg || "/home/lucy/fact_index_tacc/backend/data/Fabs Fact Database - Facts_Input-1-public.csv"
  );

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found at ${csvPath}`);
  }

  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(FactModel);

  const stream = fs.createReadStream(csvPath).pipe(
    parse({
      columns: true,
      bom: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      trim: true,
    })
  );

  let ok = 0,
    skipped = 0,
    failed = 0;

  for await (const row of stream) {
    try {
      const text = String(row[COLS.text] || "").trim();
      const sourceUrl = String(row[COLS.source] || "").trim();

      if (!text || !sourceUrl) {
        skipped++;
        continue;
      }

      const rec: QueryDeepPartialEntity<FactModel> = {
          factText: text,            // <-- property name, not DB column
          source: sourceUrl,
          type: parseRecordType(String(row[COLS.type] || "")),
          context: String(row[COLS.context] || "").trim() || undefined,
          timestamp: row[COLS.timestamp]
            ? parseUkDateTime(row[COLS.timestamp]).toISOString()
            : undefined,
          year: row[COLS.timestamp]
            ? parseUkDateTime(row[COLS.timestamp]).getFullYear()
            : undefined,
      };

      await repo.createQueryBuilder().insert().values(rec).orIgnore().execute();

      ok++;
    } catch (e) {
      failed++;
      console.error("Row failed:", e);
    }
  }

  console.log({ ok, skipped, failed });
  await AppDataSource.destroy();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
