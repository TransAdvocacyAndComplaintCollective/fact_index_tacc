import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, createSchema } from '../fact-server/src/db/schema.ts';
import type { DatabaseSchema } from '../fact-server/src/db/schema.ts';

// Lightweight CSV split that handles quoted fields (common cases)
function splitCsvLine(line: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // escaped quote
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

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // repo root is two levels up from apps/script
  const repoRoot = path.resolve(__dirname, '..', '..');
  const csvPath = path.join(repoRoot, 'data', 'Fabs Fact Database - Facts_Input-1-public.csv');
  const dbPath = path.join(repoRoot, 'db', 'dev.sqlite3');

  if (!fs.existsSync(csvPath)) {
    console.error('CSV not found at', csvPath);
    process.exit(1);
  }

  if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const raw = fs.readFileSync(csvPath, { encoding: 'utf8' });

  // Split into lines and handle BOM
  const lines = raw.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').split('\n');
  if (lines.length < 2) {
    console.error('CSV appears empty');
    process.exit(1);
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);

  const idx = (nameFragments: string[]) => {
    for (const f of nameFragments) {
      const i = headers.findIndex((h) => h.includes(f));
      if (i >= 0) return i;
    }
    return -1;
  };

  const iTimestamp = idx(['timestamp']);
  const iFact = idx(['fact', 'fact / evidence']);
  const iSource = idx(['source']);
  const iType = idx(['type : facts', 'type']);
  const iSubject = idx(['subject']);
  const iAudience = idx(['target audience']);
  const iContext = idx(['context']);
  const iDiscord = idx(['discord name']);
  const iEmail = idx(['email']);

  // Use the project's Kysely `db` and ensure schema exists
  await createSchema(db as any);

  let inserted = 0;
  let skipped = 0;

  for (let ln = 1; ln < lines.length; ln++) {
    const line = lines[ln];
    if (!line || !line.trim()) continue;
    const parts = splitCsvLine(line);
    const timestamp = iTimestamp >= 0 ? parts[iTimestamp] : '';
    const factText = iFact >= 0 ? parts[iFact] : '';
    const source = iSource >= 0 ? parts[iSource] : null;
    const type = iSubject >= 0 && parts[iSubject] ? parts[iSubject] : (iType >= 0 ? parts[iType] : null);
    const audience = iAudience >= 0 ? parts[iAudience] : null;
    const context = iContext >= 0 ? parts[iContext] : null;
    const discordName = iDiscord >= 0 ? parts[iDiscord] : null;
    const email = iEmail >= 0 ? parts[iEmail] : null;

    const finalContext = audience || context || null;

    let year: number | null = null;
    if (timestamp) {
      const m = timestamp.match(/(\d{4})/);
      if (m) year = Number(m[1]);
    }

    if (!factText || !String(factText).trim()) {
      skipped++;
      continue;
    }

    // find existing user by email or discord_name
    let userId: number | null = null;
    if (email || discordName) {
      // Prefer lookup by email, then by discord_name to avoid using unsupported
      // orWhere/ExpressionBuilder features in this script environment.
      if (email) {
        const foundByEmail = await (db as any).selectFrom('users').select('id').where('email', '=', email).executeTakeFirst();
        if (foundByEmail && (foundByEmail as any).id) userId = (foundByEmail as any).id as number;
      }
      if (!userId && discordName) {
        const foundByDiscord = await (db as any).selectFrom('users').select('id').where('discord_name', '=', discordName).executeTakeFirst();
        if (foundByDiscord && (foundByDiscord as any).id) userId = (foundByDiscord as any).id as number;
      }

      if (!userId) {
        await (db as any).insertInto('users').values({ discord_name: discordName ?? null, email: email ?? null }).execute();
        // Lookup the newly inserted row by email first, then discord_name
        if (email) {
          const lookup = await (db as any).selectFrom('users').select('id').where('email', '=', email).executeTakeFirst();
          if (lookup && (lookup as any).id) userId = (lookup as any).id as number;
        }
        if (!userId && discordName) {
          const lookup2 = await (db as any).selectFrom('users').select('id').where('discord_name', '=', discordName).executeTakeFirst();
          if (lookup2 && (lookup2 as any).id) userId = (lookup2 as any).id as number;
        }
      }
    }

    await (db as any)
      .insertInto('facts')
      .values({
        timestamp: timestamp || new Date().toISOString(),
        fact_text: factText,
        source: source,
        type: type,
        context: finalContext,
        year: year,
        user_id: userId,
        suppressed: 0,
      })
      .execute();

    inserted++;
  }

  console.log(`Inserted ${inserted} facts into ${dbPath} (skipped ${skipped} rows with empty fact_text)`);
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
