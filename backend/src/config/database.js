/**
 * config/database.js
 *
 * PostgreSQL via Supabase for ALL environments — local dev AND production.
 * Migrated from MySQL to leverage Supabase managed PostgreSQL.
 *
 * LOCAL SETUP (PostgreSQL):
 *   1. Install PostgreSQL 12+ (or use Docker: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15`)
 *   2. Create database:  CREATE DATABASE medicare_db;
 *   3. Copy .env.example → .env and fill in DB_* values
 *   4. npm install pg pg-hstore  (already in package.json)
 *
 * SUPABASE PRODUCTION:
 *   1. Create Supabase project at https://supabase.com
 *   2. Get connection string from Supabase dashboard
 *   3. Set DATABASE_URL or individual DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 *   4. Set DB_SSL=true (Supabase requires SSL)
 *//**
 * config/database.js
 *
 * PostgreSQL connection via Supabase Pooler
 * Supports:
 * 1. Production → Supabase via DATABASE_URL
 * 2. Local development → fallback local postgres
 */

const { Sequelize } = require("sequelize");

const NODE_ENV = process.env.NODE_ENV || "development";

// Prefer DATABASE_URL (recommended for Supabase + Render)
const DATABASE_URL = process.env.DATABASE_URL;

let sequelize;

if (DATABASE_URL) {
  console.log("[DB] Using DATABASE_URL connection");

  sequelize = new Sequelize(DATABASE_URL, {
    dialect: "postgres",

    logging:
      NODE_ENV === "development"
        ? (sql) => console.log("\x1b[36m[SQL]\x1b[0m", sql)
        : false,

    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 10000,
    },

    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
      statement_timeout: 20000,
      idle_in_transaction_session_timeout: 10000,
    },

    define: {
      timestamps: true,
      underscored: false,
    },
  });
} else {
  console.log("[DB] Using local PostgreSQL connection");

  sequelize = new Sequelize(
    process.env.DB_NAME || "medicare_db",
    process.env.DB_USER || "postgres",
    process.env.DB_PASSWORD || "postgres",
    {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432", 10),
      dialect: "postgres",

      logging:
        NODE_ENV === "development"
          ? (sql) => console.log("\x1b[36m[SQL]\x1b[0m", sql)
          : false,

      pool: {
        max: 10,
        min: 2,
        acquire: 30000,
        idle: 10000,
      },

      dialectOptions: {
        ssl: false,
      },

      define: {
        timestamps: true,
        underscored: false,
      },
    }
  );
}

module.exports = sequelize;