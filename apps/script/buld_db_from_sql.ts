import path from 'path';
import { fileURLToPath } from 'url';
import { findRepoRoot, importFactsFromCsv } from '../../dist/libs/db-core/src/index.js';

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const repoRoot = findRepoRoot(path.dirname(__filename));
  const csvPath = path.join(repoRoot, 'data', 'Fabs Fact Database - Facts_Input-1-public.csv');

  try {
    const result = await importFactsFromCsv({ csvPath, repoRoot });
    console.log(`Inserted ${result.inserted} facts into ${result.dbPath} (skipped ${result.skipped} rows with empty fact_text)`);
  } catch (err) {
    console.error('Import failed:', err);
    process.exit(1);
  }
}

main();
