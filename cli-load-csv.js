// cli-load-csv.js

const path = require('path');
const importFactsFromCSV = require('./db/importFactsFromCsv.js');

// USAGE: node cli-load-csv.js <path-to-csv>

async function main() {
    const csvFile = process.argv[2];

    if (!csvFile) {
        console.error('Usage: node cli-load-csv.js <csv-file>');
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

if (require.main === module) {
    main();
}
