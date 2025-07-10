// importFactsFromCSV.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';
import factRepo from './factRepository.js';

// Parse year from string/date or return undefined
// Parse year from string/date or return undefined
function extractYear(row, timestamp) {
    // Try to find year in the year-related fields, in order
    const yearFields = [
        'Year', 'year', 'Publishing year'
    ];
    for (const field of yearFields) {
        let y = row[field];
        if (y && typeof y === 'string' && y.trim()) {
            y = y.trim();

            // Find all possible 4-digit years
            const matches = [...y.matchAll(/\b(19|20)\d{2}\b/g)];
            for (const match of matches) {
                const candidate = parseInt(match[0], 10);
                if (candidate >= 1900 && candidate <= 2100) {
                    return candidate;
                }
            }

            // Try to parse as a date (covers "09/02/2025 23:31:33" etc.)
            const d = new Date(y);
            if (!isNaN(d.getTime())) {
                const candidate = d.getFullYear();
                if (candidate >= 1900 && candidate <= 2100) {
                    return candidate;
                }
            }
        }
    }

    // If not found, try the timestamp field
    if (timestamp && typeof timestamp === 'string' && timestamp.trim()) {
        // Try to find 4-digit years in timestamp string
        const matches = [...timestamp.matchAll(/\b(19|20)\d{2}\b/g)];
        for (const match of matches) {
            const candidate = parseInt(match[0], 10);
            if (candidate >= 1900 && candidate <= 2100) {
                return candidate;
            }
        }
        // Try to parse timestamp as date
        const d = new Date(timestamp);
        if (!isNaN(d.getTime())) {
            const candidate = d.getFullYear();
            if (candidate >= 1900 && candidate <= 2100) {
                return candidate;
            }
        }
    }

    return null;
}

export async function importFactsFromCSV(csvFilePath) {
    const content = fs.readFileSync(csvFilePath, 'utf8');
    // Parse CSV
    const rows = parse(content, {
        columns: true,
        skip_empty_lines: true,
    });

    let imported = 0, skipped = 0, failed = 0;
    for (let row of rows) {
        try {
            // Extract columns (preserves your current CSV format)
            let timestamp = row['Timestamp'] || row['timestamp'] || '';
            let fact_text = row['Fact / Evidence/Quote (Please keep this as short as possible whilst being accurate)'] || row['fact_text'];
            let source = row['Source (If no URL upload to drive and extract URL )'] || row['source'];
            let type = row['Type : Facts or Evidence?'] || row['type'];
            let context = row['Context'] || row['context'] || '';
            let discord_name = row['Discord Name or First / Last Name or Group Name'] || row['discord_name'];
            let email = row['Email address'] || row['email'];

            // Subjects and audiences: comma separated list (with possible extra quotes)
            let subjects_raw = row['Subject (If you want to add more that one other tag, please do so in this format under the other option: "Subject_01, Subject_02, Subject_03 "'] || row['subjects'];
            let audiences_raw = row['Target Audience (who will want to know this)'] || row['audiences'];

            let subjects = [];
            if (subjects_raw && typeof subjects_raw === 'string') {
                subjects = subjects_raw.replace(/["']/g, '').split(',').map(s => s.trim()).filter(Boolean);
            }
            let audiences = [];
            if (audiences_raw && typeof audiences_raw === 'string') {
                audiences = audiences_raw.replace(/["']/g, '').split(',').map(a => a.trim()).filter(Boolean);
            }

            // Parse year if available
            let year = extractYear(row, timestamp);

            // Find/create user by email or discord_name
            let user = null;
            if (email && email.trim()) {
                user = await factRepo.db('users').whereRaw('LOWER(email) = ?', email.trim().toLowerCase()).first();
            }
            if (!user && discord_name && discord_name.trim()) {
                user = await factRepo.db('users').whereRaw('LOWER(discord_name) = ?', discord_name.trim().toLowerCase()).first();
            }
            if (!user) {
                user = await factRepo.findOrCreateUser(discord_name ? discord_name.trim() : null, email ? email.trim() : null);
            }

            // Skip duplicates
            if (await factRepo.factExists({ fact_text, source })) {
                skipped++;
                continue;
            }

            // Prepare insert object
            const factObj = {
                fact_text,
                source,
                type,
                context,
                user_id: user.id,
                year,
                subjects,
                audiences,
            };
            if (timestamp && timestamp.trim()) {
                factObj.timestamp = new Date(timestamp);
            }

            await factRepo.createFact(factObj);
            imported++;
        } catch (err) {
            failed++;
            console.error(`[IMPORT] Failed to import row:`, row, '\nError:', err);
        }
    }

    console.log(`Imported: ${imported}, Skipped (duplicates): ${skipped}, Failed: ${failed}`);
    await factRepo.db.destroy();
}

// CLI runner check for ES modules
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
    const file = process.argv[2];
    if (!file) {
        console.error('Usage: node importFactsFromCSV.mjs <csv-file>');
        process.exit(1);
    }
    importFactsFromCSV(path.resolve(file)).catch(e => {
        console.error(e);
        process.exit(2);
    });
}

export default importFactsFromCSV;
