import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  development: {
    client: 'sqlite3',
    connection: { filename: path.resolve(__dirname, 'dev.sqlite3') },
    useNullAsDefault: true,
    pool: { afterCreate: (conn: any, cb: any) => { conn.run('PRAGMA foreign_keys = ON', cb); } },
    migrations: { directory: './migrations' },
    seeds: { directory: './seeds' },
  }
};
