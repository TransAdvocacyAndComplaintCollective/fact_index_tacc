// schema.js
// This script creates (and upgrades) the database schema for the Fabs Fact Database using Knex.js.

const environment = process.env.NODE_ENV || 'development';
const knexConfig = require('./knexfile');
const knex = require('knex');
const db = knex(knexConfig[environment]);

async function createSchema() {
  // USERS
  if (!(await db.schema.hasTable('users'))) {
    await db.schema.createTable('users', t => {
      t.increments('id').primary();
      t.string('discord_name'); // or full name or group name (expand later if needed)
      t.string('email');
    });
    console.log('Created table: users');
  }

  // FACTS
  if (!(await db.schema.hasTable('facts'))) {
    await db.schema.createTable('facts', t => {
      t.increments('id').primary();
      t.timestamp('timestamp').defaultTo(db.fn.now()).notNullable();
      t.text('fact_text').notNullable();
      t.string('source');
      t.string('type');
      t.string('context');
      t.integer('year'); // Year of publishing (matches CSV)
      t.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
      t.boolean('suppressed').notNullable().defaultTo(false);
    });
    console.log('Created table: facts');
  } else {
    // Add "year" column if not present (migration/upgrade)
    const hasYear = await db.schema.hasColumn('facts', 'year');
    if (!hasYear) {
      await db.schema.table('facts', t => t.integer('year'));
      console.log('Added column "year" to table: facts');
    }
  }

  // SUBJECTS
  if (!(await db.schema.hasTable('subjects'))) {
    await db.schema.createTable('subjects', t => {
      t.increments('id').primary();
      t.string('name').unique().notNullable();
    });
    console.log('Created table: subjects');
  }

  // FACT_SUBJECTS (junction)
  if (!(await db.schema.hasTable('fact_subjects'))) {
    await db.schema.createTable('fact_subjects', t => {
      t.integer('fact_id').notNullable().references('id').inTable('facts').onDelete('CASCADE');
      t.integer('subject_id').notNullable().references('id').inTable('subjects').onDelete('CASCADE');
      t.primary(['fact_id', 'subject_id']);
    });
    console.log('Created table: fact_subjects');
  }

  // TARGET_AUDIENCES
  if (!(await db.schema.hasTable('target_audiences'))) {
    await db.schema.createTable('target_audiences', t => {
      t.increments('id').primary();
      t.string('name').unique().notNullable();
    });
    console.log('Created table: target_audiences');
  }

  // FACT_TARGET_AUDIENCES (junction)
  if (!(await db.schema.hasTable('fact_target_audiences'))) {
    await db.schema.createTable('fact_target_audiences', t => {
      t.integer('fact_id').notNullable().references('id').inTable('facts').onDelete('CASCADE');
      t.integer('target_audience_id').notNullable().references('id').inTable('target_audiences').onDelete('CASCADE');
      t.primary(['fact_id', 'target_audience_id']);
    });
    console.log('Created table: fact_target_audiences');
  }

  // Indexes for faster lookups (wrap in try/catch for compatibility)
  try {
    await db.schema.raw('CREATE INDEX IF NOT EXISTS idx_facts_timestamp ON facts(timestamp);');
  } catch (e) {}
  try {
    await db.schema.raw('CREATE INDEX IF NOT EXISTS idx_facts_type ON facts(type);');
  } catch (e) {}
  try {
    await db.schema.raw('CREATE INDEX IF NOT EXISTS idx_subjects_name ON subjects(name);');
  } catch (e) {}
  try {
    await db.schema.raw('CREATE INDEX IF NOT EXISTS idx_target_audiences_name ON target_audiences(name);');
  } catch (e) {}

  console.log('Schema created or already exists.');
  await db.destroy();
}

createSchema().catch(err => {
  console.error(err);
  process.exit(1);
});
