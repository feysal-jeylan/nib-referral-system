/**
 * referral-api/db.js
 * ------------------
 * Creates and exports a single PostgreSQL connection pool for the whole app.
 *
 * WHY A POOL (not a single client)?
 *   A pool keeps several DB connections open and reuses them across requests.
 *   Without a pool, every API call would open a new connection, wait for it,
 *   then close it — which is slow and wasteful.
 *   With a pool, a free connection is handed to each request instantly.
 *
 * HOW TO USE (in a route file):
 *   const pool = require('../db');
 *   const result = await pool.query('SELECT $1::text AS msg', ['hello']);
 *   console.log(result.rows[0].msg); // 'hello'
 */

'use strict';

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port:     process.env.DB_PORT || 5432,

  // Connection pool limits.
  // max: never open more than 10 simultaneous DB connections.
  // idleTimeoutMillis: close a connection after 30s of inactivity.
  // connectionTimeoutMillis: fail fast if we can't get a connection in 2s.
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test the connection when the server starts.
// This gives an immediate, clear error if the .env credentials are wrong,
// rather than a cryptic failure on the first API call.
pool.connect((err, client, release) => {
  if (err) {
    console.error('[DB] Failed to connect to PostgreSQL:', err.message);
    console.error('[DB] Check your .env credentials (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).');
    return;
  }
  release(); // Return the test connection back to the pool immediately.
  console.log('[DB] PostgreSQL connection pool established successfully.');
});

module.exports = pool;
