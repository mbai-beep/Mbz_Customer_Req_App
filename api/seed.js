const { getDB, ensureTable } = require('./_db');
const bcrypt = require('bcryptjs');
const EMPLOYEES = require('../data/employees.json');

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'mb-admin-seed-2024';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { secret } = req.query;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden. Pass ?secret=ADMIN_SECRET' });

  await ensureTable();
  const db = getDB();

  let inserted = 0, updated = 0, skipped = 0, errors = 0;

  for (const emp of EMPLOYEES) {
    try {
      await db.execute({
        sql: `INSERT OR REPLACE INTO employees (emp_code, emp_name, emp_mobile, emp_designation, hod, store_code, store_name, store_locality, city, state, store_status, role)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [emp.emp_code, emp.emp_name, emp.emp_mobile, emp.emp_designation, emp.hod, emp.store_code, emp.store_name, emp.store_locality, emp.city, emp.state, emp.store_status, emp.role]
      });

      const existing = await db.execute({ sql: 'SELECT emp_code FROM employee_auth WHERE emp_code = ?', args: [emp.emp_code] });
      if (!existing.rows.length) {
        const initialPassword = `MB@${emp.emp_code}`;
        const hash = await bcrypt.hash(initialPassword, 10);
        await db.execute({
          sql: 'INSERT INTO employee_auth (emp_code, password_hash, is_first_login) VALUES (?, ?, 1)',
          args: [emp.emp_code, hash]
        });
        inserted++;
      } else {
        skipped++;
      }
    } catch(e) {
      console.error('Seed error for emp', emp.emp_code, e.message);
      errors++;
    }
  }

  return res.json({
    success: true,
    message: 'Seeding complete! Initial passwords: MB@<EmployeeCode>',
    inserted, skipped, errors,
    total: EMPLOYEES.length
  });
};
