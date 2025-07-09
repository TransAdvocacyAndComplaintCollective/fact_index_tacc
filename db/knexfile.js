// knexfile.js
const path = require('path');

module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      // Use an absolute path to avoid working-directory mismatches
      filename: path.resolve(__dirname, 'dev.sqlite3'),
    },
    useNullAsDefault: true,  // Recommended for sqlite3 with Knex :contentReference[oaicite:1]{index=1}
    pool: {
      afterCreate: (conn, cb) => {
        conn.run('PRAGMA foreign_keys = ON', cb);
      },
    },
    migrations: {
      directory: './migrations', // relative to this file—standard practice :contentReference[oaicite:2]{index=2}
    },
    seeds: {
      directory: './seeds',     // relative paths are best practice :contentReference[oaicite:3]{index=3}
    },
  },

  // Add production/postgres or other environments here
};
