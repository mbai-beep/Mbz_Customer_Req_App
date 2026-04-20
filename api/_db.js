const { createClient } = require('@libsql/client');
let _client = null;

function getDB() {
  if (!_client) {
    _client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return _client;
}

async function ensureTable() {
  const db = getDB();

  // Main entries table
  await db.execute(`CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    mobile_number TEXT NOT NULL,
    store_name TEXT NOT NULL,
    store_code TEXT DEFAULT '',
    requirement TEXT DEFAULT '',
    description TEXT DEFAULT '',
    employee TEXT NOT NULL,
    employee_id TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    status TEXT DEFAULT 'new',
    has_voice INTEGER DEFAULT 0,
    voice_duration TEXT DEFAULT '',
    photo_count INTEGER DEFAULT 0,
    photo_urls TEXT DEFAULT '[]',
    audio_url TEXT DEFAULT '',
    synced_at TEXT,
    fulfillment_status TEXT DEFAULT 'Pending',
    submitted_by INTEGER DEFAULT 0
  )`);

  // Migrate existing entries table
  try { await db.execute("ALTER TABLE entries ADD COLUMN store_code TEXT DEFAULT ''"); } catch(e) {}
  try { await db.execute("ALTER TABLE entries ADD COLUMN requirement TEXT DEFAULT ''"); } catch(e) {}
  try { await db.execute("ALTER TABLE entries ADD COLUMN photo_urls TEXT DEFAULT '[]'"); } catch(e) {}
  try { await db.execute("ALTER TABLE entries ADD COLUMN audio_url TEXT DEFAULT ''"); } catch(e) {}
  try { await db.execute("ALTER TABLE entries ADD COLUMN fulfillment_status TEXT DEFAULT 'Pending'"); } catch(e) {}
  try { await db.execute("ALTER TABLE entries ADD COLUMN submitted_by INTEGER DEFAULT 0"); } catch(e) {}

  // Employees table
  await db.execute(`CREATE TABLE IF NOT EXISTS employees (
    emp_code INTEGER PRIMARY KEY,
    emp_name TEXT NOT NULL,
    emp_mobile TEXT NOT NULL,
    emp_designation TEXT DEFAULT '',
    hod TEXT DEFAULT '',
    store_code TEXT DEFAULT '',
    store_name TEXT DEFAULT '',
    store_locality TEXT DEFAULT '',
    city TEXT DEFAULT '',
    state TEXT DEFAULT '',
    store_status TEXT DEFAULT 'Active',
    role TEXT DEFAULT 'employee'
  )`);

  // Employee auth table
  await db.execute(`CREATE TABLE IF NOT EXISTS employee_auth (
    emp_code INTEGER PRIMARY KEY,
    password_hash TEXT NOT NULL,
    is_first_login INTEGER DEFAULT 1,
    otp TEXT DEFAULT '',
    otp_expires_at TEXT DEFAULT ''
  )`);
}

module.exports = { getDB, ensureTable };
