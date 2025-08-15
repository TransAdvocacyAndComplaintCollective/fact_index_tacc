"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/db/knexfile.ts
var path_1 = require("path");
var dotenv_1 = require("dotenv");
var url_1 = require("url");
var knex_1 = require("knex");
var Knex = knex_1.default.Knex;
// Load env once
dotenv_1.default.config();
// __dirname in ESM
var __filename = (0, url_1.fileURLToPath)(import.meta.url);
var __dirname = path_1.default.dirname(__filename);
// Centralized paths (this file lives in src/db/*)
var MIGRATIONS_DIR = path_1.default.join(__dirname, "migrations");
var SEEDS_DIR = path_1.default.join(__dirname, "seeds");
var SQLITE_FILE = process.env.SQLITE_FILE
    ? path_1.default.resolve(process.env.SQLITE_FILE)
    : path_1.default.join(__dirname, "data", "facts.sqlite");
// Minimal, opt-in logging
var shouldLog = !!process.env.KNEXFILE_DEBUG;
var log = function () {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    if (shouldLog)
        console.log.apply(console, __spreadArray(["[Knexfile]"], args, false));
};
// Helpers
var lower = function (s) { return (s || "").toLowerCase(); };
var urlStartsWith = function (s, prefix) {
    return !!s && prefix.test(s.toLowerCase());
};
// Detect client from env
var dbClient = lower(process.env.DB_CLIENT);
var isMySQLClient = /^mysql/.test(dbClient) || dbClient === "mariadb";
var isMySQLURL = urlStartsWith(process.env.DATABASE_URL, /^(mysql|mysql2|mariadb):/);
log("Loaded at:", __filename);
log("Directory:", __dirname);
log("NODE_ENV:", process.env.NODE_ENV);
log("DB_CLIENT:", process.env.DB_CLIENT);
log("DATABASE_URL set:", !!process.env.DATABASE_URL);
log("Using MySQL?", isMySQLClient || isMySQLURL);
log("Migrations dir:", MIGRATIONS_DIR);
log("Seeds dir:", SEEDS_DIR);
log("SQLite file:", SQLITE_FILE);
function buildConfig() {
    if (isMySQLClient || isMySQLURL) {
        var connection = process.env.DATABASE_URL ||
            {
                host: process.env.DB_HOST || "127.0.0.1",
                port: Number(process.env.DB_PORT || 3306),
                user: process.env.DB_USER || "root",
                password: process.env.DB_PASSWORD || "",
                database: process.env.DB_NAME || "factsdb",
                // Optional SSL support if env present (e.g., PlanetScale, RDS)
                ssl: process.env.DB_SSL
                    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" }
                    : undefined,
            };
        var config_1 = {
            client: "mysql2",
            connection: connection,
            pool: { min: 0, max: 10 },
            migrations: {
                directory: MIGRATIONS_DIR,
                tableName: "knex_migrations",
                // If you use TS migrations during dev:
                loadExtensions: [".js", ".ts"],
            },
            seeds: {
                directory: SEEDS_DIR,
                loadExtensions: [".js", ".ts"],
            },
            debug: process.env.KNEX_DEBUG === "true",
        };
        log("MySQL connection config:", typeof connection === "string" ? "(DATABASE_URL string)" : connection);
        return config_1;
    }
    // SQLite (default)
    var config = {
        client: "sqlite3",
        connection: { filename: SQLITE_FILE },
        useNullAsDefault: true,
        pool: {
            // sqlite benefits from a tiny pool
            min: 1,
            max: 1,
            // ensure foreign keys are enforced
            afterCreate: function (conn, done) {
                conn.run("PRAGMA foreign_keys = ON", function (err) { return done(err, conn); });
            },
        },
        migrations: {
            directory: MIGRATIONS_DIR,
            tableName: "knex_migrations",
            loadExtensions: [".js", ".ts"],
        },
        seeds: {
            directory: SEEDS_DIR,
            loadExtensions: [".js", ".ts"],
        },
        debug: process.env.KNEX_DEBUG === "true",
    };
    log("SQLite config ready");
    return config;
}
var finalConfig = buildConfig();
log("Final knex configuration built");
exports.default = finalConfig;
