// backend/db/schema/createFactsDb.ts

import type { Knex } from 'knex';

export async function createFacts(db: Knex): Promise<void> {
  if (!(await db.schema.hasTable('facts'))) {
    await db.schema.createTable('facts', (t: Knex.TableBuilder) => {
      t.increments('id').primary();
      t.timestamp('timestamp').defaultTo(db.fn.now()).notNullable();
      t.text('fact_text').notNullable();
      t.string('source');
      t.string('type');
      t.string('context');
      t.integer('year');
      t.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
      t.boolean('suppressed').notNullable().defaultTo(false);
    });
    console.log('Created table: facts');
  } else {
    const hasYear = await db.schema.hasColumn('facts', 'year');
    if (!hasYear) {
      await db.schema.table('facts', (t: Knex.TableBuilder) => {
        t.integer('year');
      });
      console.log('Added column "year" to table: facts');
    }
  }
}

export async function createSubjects(db: Knex): Promise<void> {
  if (!(await db.schema.hasTable('subjects'))) {
    await db.schema.createTable('subjects', (t: Knex.TableBuilder) => {
      t.increments('id').primary();
      t.string('name').unique().notNullable();
    });
    console.log('Created table: subjects');
  }
  if (!(await db.schema.hasTable('fact_subjects'))) {
    await db.schema.createTable('fact_subjects', (t: Knex.TableBuilder) => {
      t.integer('fact_id').notNullable().references('id').inTable('facts').onDelete('CASCADE');
      t.integer('subject_id').notNullable().references('id').inTable('subjects').onDelete('CASCADE');
      t.primary(['fact_id', 'subject_id']);
    });
    console.log('Created table: fact_subjects');
  }
}

export async function createTargetAudiences(db: Knex): Promise<void> {
  if (!(await db.schema.hasTable('target_audiences'))) {
    await db.schema.createTable('target_audiences', (t: Knex.TableBuilder) => {
      t.increments('id').primary();
      t.string('name').unique().notNullable();
    });
    console.log('Created table: target_audiences');
  }
  if (!(await db.schema.hasTable('fact_target_audiences'))) {
    await db.schema.createTable('fact_target_audiences', (t: Knex.TableBuilder) => {
      t.integer('fact_id').notNullable().references('id').inTable('facts').onDelete('CASCADE');
      t.integer('target_audience_id').notNullable().references('id').inTable('target_audiences').onDelete('CASCADE');
      t.primary(['fact_id', 'target_audience_id']);
    });
    console.log('Created table: fact_target_audiences');
  }
}
