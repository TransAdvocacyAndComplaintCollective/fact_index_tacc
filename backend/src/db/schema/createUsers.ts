// backend/db/schema/createUsers.ts

import type { Knex } from 'knex';

export default async function createUsers(db: Knex): Promise<void> {
  if (!(await db.schema.hasTable('users'))) {
    await db.schema.createTable('users', (t: Knex.TableBuilder) => {
      t.increments('id').primary();
      t.string('discord_name');
      t.string('email');
    });
    console.log('Created table: users');
  }
}
