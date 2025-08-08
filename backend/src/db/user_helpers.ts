import { logQuery } from './logQuery.ts'; // Assuming logQuery is a utility function for logging queries
import pinologger from '../logger/pino.ts'; // centralized pino logger
import knexConfig from './knexfile.ts';
import knex from 'knex'; // Import knex constructor
const pinolog = pinologger.child({ component: 'factRepository' });

const environment = process.env.NODE_ENV || 'development';
const db = knex(knexConfig[environment]);
// ---- user_helpers ----
export async function listUsers() {
  pinolog.info('listUsers called');
  return logQuery(db('users').select('*').orderBy('discord_name'), 'SELECT users');
}

export async function findOrCreateUser(discord_name: string, email: string | null = null) {
  pinolog.info('findOrCreateUser called', { discord_name, email });
  let user = await logQuery(db('users').where({ discord_name }).first(), 'SELECT user');
  if (user) {
    pinolog.info('findOrCreateUser exists', { id: user.id });
    return user;
  }
  const [id] = await logQuery(db('users').insert({ discord_name, email }), 'INSERT user');
  pinolog.info('findOrCreateUser inserted', { id });
  return logQuery(db('users').where({ id }).first(), 'SELECT user by id');
}