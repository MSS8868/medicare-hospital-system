/**
 * config/database.js
 *
 * MySQL for ALL environments — local dev AND production.
 * No more SQLite/Postgres split. One database engine everywhere.
 *
 * LOCAL SETUP:
 *   1. Install MySQL 8+  (or use XAMPP / Docker: `docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=medicare_db mysql:8`)
 *   2. Create database:  CREATE DATABASE medicare_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
 *   3. Copy .env.example → .env and fill in DB_* values
 *   4. npm install mysql2  (already in package.json)
 *
 * RAILWAY PRODUCTION:
 *   1. Add MySQL plugin in Railway dashboard (or use PlanetScale)
 *   2. Railway auto-sets MYSQLHOST, MYSQLPORT, MYSQLDATABASE, MYSQLUSER, MYSQLPASSWORD
 *      — OR set DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD manually
 *   3. Set DB_SSL=true for PlanetScale / cloud MySQL
 */

const { Sequelize } = require('sequelize');

// Support both Railway auto-variables (MYSQL*) and manual (DB_*) naming
const DB_HOST     = process.env.DB_HOST     || process.env.MYSQLHOST     || 'localhost';
const DB_PORT     = process.env.DB_PORT     || process.env.MYSQLPORT     || '3306';
const DB_NAME     = process.env.DB_NAME     || process.env.MYSQLDATABASE || 'medicare_db';
const DB_USER     = process.env.DB_USER     || process.env.MYSQLUSER     || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '';
const DB_SSL      = process.env.DB_SSL === 'true';
const NODE_ENV    = process.env.NODE_ENV    || 'development';

if (!DB_PASSWORD && NODE_ENV === 'production') {
  // Warn loudly in production if no password — but don't crash
  console.warn('[DB] ⚠️  DB_PASSWORD is empty in production. Please set it in Railway environment variables.');
}

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host:    DB_HOST,
  port:    parseInt(DB_PORT, 10),
  dialect: 'mysql',

  // Show SQL queries in development for easy debugging; silent in production
  logging: NODE_ENV === 'development'
    ? (sql) => console.log('\x1b[36m[SQL]\x1b[0m', sql)
    : false,

  pool: {
    max:     10,    // max connections kept open
    min:     2,     // always keep 2 alive
    acquire: 30000, // wait up to 30s to get a connection before throwing
    idle:    10000, // close connection after 10s idle
  },

  dialectOptions: {
    // SSL required by PlanetScale, AWS RDS, some Railway plugins
    ssl: DB_SSL ? { rejectUnauthorized: false } : false,
    // MySQL 8 needs this for auth compatibility
    connectTimeout: 20000,
  },

  define: {
    timestamps:  true,
    underscored: false,  // keep camelCase column names throughout
    charset:     'utf8mb4',
    collate:     'utf8mb4_unicode_ci',  // full Unicode + emoji support
  },
});

module.exports = sequelize;
