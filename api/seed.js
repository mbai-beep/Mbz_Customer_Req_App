const { getDB, ensureTable } = require('./_db');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const sec = (req.query || {}).secret || '';
  if (sec !== 'mb-admin-seed-2024') return res.status(403).json({ error: 'Forbidden' });
  try {
    await ensureTable();
    const db = getDB();
    const dataPath = path.join(process.cwd(), 'data', 'employees.json');
    const raw = fs.readFileSync(dataPath, 'utf8');
    const employees = JSON.parse(raw);
    let inserted = 0, errors = 0;
    const BATCH = 20, ROUNDS = 6;
    for (let i = 0; i < employees.length; i += BATCH) {
      const batch = employees.slice(i, i + BATCH);
      await Promise.all(batch.map(async (emp) => {
        try {
          const hash = await bcrypt.hash('MB@' + emp.emp_code, ROUNDS);
          await db.execute({
            sql: `INSERT OR REPLACE INTO employees
              (emp_code,emp_name,emp_mobile,emp_designation,hod,
               store_code,store_name,store_locality,city,state,
               store_status,role,password_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            args: [emp.emp_code, emp.emp_name||'', emp.emp_mobile||'',
              emp.emp_designation||'', emp.hod||'', emp.store_code||'',
              emp.store_name||'', emp.store_locality||'', emp.city||'',
              emp.state||'', emp.store_status||'Active', emp.role||'employee', hash]
          });
          inserted++;
        } catch(e) { errors++; }
      }));
    }
    return res.json({ success: true, inserted, errors, total: employees.length });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};