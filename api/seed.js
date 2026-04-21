const { getDB, ensureTable } = require('./_db');
const bcrypt = require('bcryptjs');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'mb-admin-seed-2024';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  const secret = req.query.secret || (req.body && req.body.secret) || '';
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let EMPLOYEES = req.body;
  if (!Array.isArray(EMPLOYEES)) {
    return res.status(400).json({ error: 'Body must be array of employees' });
  }

  try {
    await ensureTable();
  } catch(e) {
    return res.status(500).json({ error: 'ensureTable failed: ' + e.message });
  }

  const db = getDB();
  let inserted = 0, skipped = 0, errors = 0;
  let firstError = null;

  for (const emp of EMPLOYEES) {
    try {
      await db.execute({
        sql: `INSERT OR REPLACE INTO employees (emp_code, emp_name, emp_mobile, emp_designation, hod, store_code, store_name, store_locality, city, state, store_status, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [emp.emp_code, emp.emp_name, emp.emp_mobile, emp.emp_designation, emp.hod, emp.store_code, emp.store_name, emp.store_locality, emp.city, emp.state, emp.store_status, emp.role]
      });
      const existing = await db.execute({ sql: 'SELECT emp_code FROM employee_auth WHERE emp_code = ?', args: [emp.emp_code] });
      if (!existing.rows.length) {
        const hash = await bcrypt.hash('MB@' + emp.emp_code, 6);
        await db.execute({
          sql: 'INSERT INTO employee_auth (emp_code, password_hash, is_first_login) VALUES (?, ?, 1)',
          args: [emp.emp_code, hash]
        });
        inserted++;
      } else {
        skipped++;
      }
    } catch(e) {
      if (!firstError) firstError = 'emp ' + emp.emp_code + ': ' + e.message;
      errors++;
    }
  }
  return res.json({ success: true, inserted, skipped, errors, total: EMPLOYEES.length, firstError });
};
