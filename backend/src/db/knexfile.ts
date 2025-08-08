import path from 'path';
import { fileURLToPath } from 'url';
import type { Knex } from 'knex';

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Knex configuration object
const config: Record<string, Knex.Config> = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: path.resolve(__dirname, 'dev.sqlite3'),
    },
    useNullAsDefault: true,
    pool: {
      afterCreate: (conn: any, cb: (err: Error | null, conn: any) => void) => {
        conn.run('PRAGMA foreign_keys = ON', cb);
      },
    },
    migrations: {
      directory: path.resolve(__dirname, 'migrations'),
      extension: 'js',
    },
    seeds: {
      directory: path.resolve(__dirname, 'seeds'),
      extension: 'js',
    },
  },

  // Example for production using PostgreSQL
  // production: {
  //   client: 'pg',
  //   connection: process.env.DATABASE_URL,
  //   pool: { min: 2, max: 10 },
  //   migrations: {
  //     directory: path.resolve(__dirname, 'migrations'),
  //     extension: 'js',
  //   },
  //   seeds: {
  //     directory: path.resolve(__dirname, 'seeds'),
  //     extension: 'js',
  //   },
  // },
};

export default config;
