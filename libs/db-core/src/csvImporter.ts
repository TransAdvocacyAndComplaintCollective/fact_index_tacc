import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { db, createSchema, initializeDb, findRepoRoot } from './dbClient.js';
import { createFact } from './factRepository.js';

interface ImportFactsOptions {
  csvPath?: string;
  repoRoot?: string;
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  csvPath: string;
  dbPath: string;
}

function splitCsvLine(line: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((s) => s.trim());
}

function normalizeHeader(h: string) {
  return h.replace(/\s+/g, ' ').trim().toLowerCase();
}

function parseMulti(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;]+/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function normalizeList(values: string[]): string[] {
  const seen = new Set<string>();
  const normalizedList: string[] = [];
  for (const value of values) {
    const candidate = value.trim();
    if (!candidate) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalizedList.push(candidate);
  }
  return normalizedList;
}

function resolveCsvPath(options: ImportFactsOptions): string {
  if (options.csvPath && path.isAbsolute(options.csvPath)) {
    return options.csvPath;
  }
  const repoRoot = options.repoRoot ?? findRepoRoot(fileURLToPath(import.meta.url));
  const filename = options.csvPath ?? 'data/Fabs Fact Database - Facts_Input-1-public.csv';
  return path.join(repoRoot, filename);
}

export async function importFactsFromCsv(options: ImportFactsOptions = {}): Promise<ImportResult> {
  const csvPath = resolveCsvPath(options);
  const repoRoot = options.repoRoot ?? findRepoRoot(fileURLToPath(import.meta.url));
  const dbPath = path.join(repoRoot, 'db', 'dev.sqlite3');

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found at ${csvPath}`);
  }

  await initializeDb();
  await createSchema(db);

  const raw = fs.readFileSync(csvPath, { encoding: 'utf8' });
  const lines = raw.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').split('\n');
  if (lines.length < 2) {
    throw new Error('CSV appears empty');
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);

  const idx = (nameFragments: string[]) => {
    for (const f of nameFragments) {
      const i = headers.findIndex((h) => h.includes(f));
      if (i >= 0) return i;
    }
    return -1;
  };

  const colIndexes = {
    timestamp: idx(['timestamp']),
    fact: idx(['fact', 'fact / evidence']),
    source: idx(['source']),
    type: idx(['type : facts', 'type']),
    subject: idx(['subject']),
    audience: idx(['target audience']),
    context: idx(['context']),
  };

  let inserted = 0;
  let skipped = 0;

  for (let ln = 1; ln < lines.length; ln++) {
    const line = lines[ln];
    if (!line || !line.trim()) continue;
    const parts = splitCsvLine(line);
    const get = (index: number) => (index >= 0 ? parts[index] : '');

    const factText = get(colIndexes.fact);
    const timestamp = get(colIndexes.timestamp);
    const source = colIndexes.source >= 0 ? get(colIndexes.source) || null : null;
    const context = colIndexes.context >= 0 ? get(colIndexes.context) || null : null;
    const subjects = colIndexes.subject >= 0 ? normalizeList(parseMulti(get(colIndexes.subject))) : [];
    const audiences = colIndexes.audience >= 0 ? normalizeList(parseMulti(get(colIndexes.audience))) : [];
    const csvType = colIndexes.type >= 0 ? get(colIndexes.type) : null;
    const type = csvType || subjects[0] || null;

    const finalContext = context || null;

    let year: number | null = null;
    if (timestamp) {
      const m = timestamp.match(/(\d{4})/);
      if (m) year = Number(m[1]);
    }

    if (!factText || !String(factText).trim()) {
      skipped++;
      continue;
    }

    await createFact({
      fact_text: factText,
      source,
      type,
      context: finalContext,
      year,
      user_id: null,
      suppressed: false,
      subjects,
      audiences,
    });

    inserted++;
  }

  return { inserted, skipped, csvPath, dbPath };
}
