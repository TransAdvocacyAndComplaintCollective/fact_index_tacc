// cli-load-csv.mjs

import path from 'path';
import { fileURLToPath } from 'url';
import importFactsFromCSV from './db/importFactsFromCsv.js';

// USAGE: node cli-load-csv.mjs <path-to-csv>

async function main() {
    const csvFile = process.argv[2];

    if (!csvFile) {
        console.error('Usage: node cli-load-csv.mjs <csv-file>');
        process.exit(1);
    }

    // Optional: Check if file exists before proceeding
    const absPath = path.resolve(csvFile);
    try {
        await importFactsFromCSV(absPath);
        console.log('CSV import complete.');
        process.exit(0);
    } catch (err) {
        console.error('Error importing CSV:', err);
        process.exit(2);
    }
}

// Emulate "if (require.main === module)" for ES Modules
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
    main();
}

export default main;
