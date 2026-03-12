#!/usr/bin/env node
import 'dotenv/config';
import { initializeDb, createSchema, getDb } from '../libs/db-core/dist/src/dbClient.js';

(async () => {
  try {
    console.log('[scripts] Initializing DB and ensuring schema...');
    await initializeDb();
    await createSchema(getDb());
    console.log('[scripts] Schema ensured successfully');
  } catch (err) {
    console.error('[scripts] Failed to ensure schema:', err);
    process.exit(1);
  }
})();
