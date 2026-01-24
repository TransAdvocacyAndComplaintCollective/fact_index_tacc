// Plain JavaScript wrapper for sqlite3 to avoid TypeScript issues
class SqliteDriver {
  constructor(database) {
    this.db = database;
  }

  // Kysely expects a prepare method that returns a compiled statement
  prepare(sql) {
    return {
      sql,
      // all() for SELECT queries
      all: (...params) => new Promise((resolve, reject) => {
        this.db.all(sql, params[0] || [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }),
      // get() for single row
      get: (...params) => new Promise((resolve, reject) => {
        this.db.get(sql, params[0] || [], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      }),
      // run() for INSERT/UPDATE/DELETE
      run: (...params) => new Promise((resolve, reject) => {
        this.db.run(sql, params[0] || [], function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      }),
    };
  }

  async run(sql, params) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params || [], function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  async get(sql, params) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params || [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async all(sql, params) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params || [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async exec(sql) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export { SqliteDriver };
