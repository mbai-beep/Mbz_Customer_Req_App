const { getDB, ensureTable } = require('./_db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mb-customer-req-2024-secret';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  await ensureTable();
  const db = getDB();
  const { action } = req.query;

  // POST /api/auth?action=login
  if (action === 'login' && req.method === 'POST') {
    const { empCode, password, remember } = req.body || {};
    if (!empCode || !password) return res.json({ success: false, error: 'Employee ID and password are required' });

    const empResult = await db.execute({ sql: 'SELECT * FROM employees WHERE emp_code = ?', args: [parseInt(empCode)] });
    if (!empResult.rows.length) return res.json({ success: false, error: 'Employee ID not found' });

    const emp = empResult.rows[0];
    if (emp.store_status !== 'Active') return res.json({ success: false, error: 'Your account is inactive. Contact admin.' });

    const authResult = await db.execute({ sql: 'SELECT * FROM employee_auth WHERE emp_code = ?', args: [parseInt(empCode)] });
    if (!authResult.rows.length) return res.json({ success: false, error: 'Account not set up. Please contact admin to seed employee data.' });

    const auth = authResult.rows[0];
    const isValid = await bcrypt.compare(String(password), auth.password_hash);
    if (!isValid) return res.json({ success: false, error: 'Incorrect password. Try again.' });

    const expiry = remember ? '30d' : '24h';
    const token = jwt.sign({
      empCode: emp.emp_code,
      empName: emp.emp_name,
      role: emp.role,
      storeCode: emp.store_code,
      storeName: emp.store_name,
      designation: emp.emp_designation,
      mobile: emp.emp_mobile,
      isFirstLogin: Number(auth.is_first_login) === 1
    }, JWT_SECRET, { expiresIn: expiry });

    return res.json({
      success: true,
      token,
      employee: {
        empCode: emp.emp_code,
        empName: emp.emp_name,
        designation: emp.emp_designation,
        role: emp.role,
        storeCode: emp.store_code,
        storeName: emp.store_name,
        mobile: emp.emp_mobile,
        isFirstLogin: Number(auth.is_first_login) === 1
      }
    });
  }

  // POST /api/auth?action=change-password
  if (action === 'change-password' && req.method === 'POST') {
    const { empCode, currentPassword, newPassword } = req.body || {};
    if (!empCode || !currentPassword || !newPassword) return res.json({ success: false, error: 'All fields are required' });
    if (String(newPassword).length < 6) return res.json({ success: false, error: 'New password must be at least 6 characters' });

    const authResult = await db.execute({ sql: 'SELECT * FROM employee_auth WHERE emp_code = ?', args: [parseInt(empCode)] });
    if (!authResult.rows.length) return res.json({ success: false, error: 'Account not found' });

    const auth = authResult.rows[0];
    const isValid = await bcrypt.compare(String(currentPassword), auth.password_hash);
    if (!isValid) return res.json({ success: false, error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(String(newPassword), 10);
    await db.execute({ sql: 'UPDATE employee_auth SET password_hash = ?, is_first_login = 0 WHERE emp_code = ?', args: [hash, parseInt(empCode)] });
    return res.json({ success: true });
  }

  // POST /api/auth?action=reset-password (after OTP verification)
  if (action === 'reset-password' && req.method === 'POST') {
    const { empCode, newPassword, resetToken } = req.body || {};
    if (!empCode || !newPassword || !resetToken) return res.json({ success: false, error: 'All fields are required' });
    if (String(newPassword).length < 6) return res.json({ success: false, error: 'Password must be at least 6 characters' });

    try {
      const decoded = jwt.verify(resetToken, JWT_SECRET + '-reset');
      if (decoded.empCode !== parseInt(empCode)) return res.json({ success: false, error: 'Invalid reset session' });
    } catch {
      return res.json({ success: false, error: 'Reset session expired. Please request OTP again.' });
    }

    const hash = await bcrypt.hash(String(newPassword), 10);
    await db.execute({ sql: 'UPDATE employee_auth SET password_hash = ?, is_first_login = 0 WHERE emp_code = ?', args: [hash, parseInt(empCode)] });
    return res.json({ success: true });
  }

  // GET /api/auth?action=verify
  if (action === 'verify') {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.json({ valid: false });
    try {
      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, JWT_SECRET);
      return res.json({ valid: true, user: decoded });
    } catch {
      return res.json({ valid: false });
    }
  }

  return res.status(400).json({ error: 'Invalid action' });
};
