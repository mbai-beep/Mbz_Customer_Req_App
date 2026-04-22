const { createClient } = require('@libsql/client');

let db;
function getDB() {
  if (!db) {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    });
  }
  return db;
}

async function ensureTable() {
  const d = getDB();
  await d.execute(`CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    customer_name TEXT,
    mobile_number TEXT,
    store_name TEXT,
    store_code TEXT,
    requirement TEXT,
    description TEXT,
    employee TEXT,
    employee_id TEXT,
    created_at TEXT,
    status TEXT DEFAULT 'new',
    has_voice INTEGER DEFAULT 0,
    voice_duration TEXT,
    photo_count INTEGER DEFAULT 0,
    photo_urls TEXT DEFAULT '[]',
    audio_url TEXT,
    synced_at TEXT,
    fulfillment_status TEXT DEFAULT 'Pending',
    submitted_by INTEGER DEFAULT 0
  )`);
  await d.execute(`CREATE TABLE IF NOT EXISTS employees (
    emp_code INTEGER PRIMARY KEY,
    emp_name TEXT,
    emp_mobile TEXT,
    emp_designation TEXT,
    hod TEXT,
    store_code TEXT,
    store_name TEXT,
    store_locality TEXT,
    city TEXT,
    state TEXT,
    store_status TEXT DEFAULT 'Active',
    role TEXT DEFAULT 'employee',
    password_hash TEXT
  )`);
  // Safe migration: add password expiry + history columns to employee_auth
  try { await d.execute('ALTER TABLE employee_auth ADD COLUMN password_changed_at TEXT'); } catch(e) {}
  try { await d.execute("ALTER TABLE employee_auth ADD COLUMN password_history TEXT DEFAULT '[]'"); } catch(e) {}
  try { await d.execute('ALTER TABLE employee_auth ADD COLUMN tc_accepted INTEGER DEFAULT 0'); } catch(e) {}
}

module.exports = { getDB, ensureTable };
