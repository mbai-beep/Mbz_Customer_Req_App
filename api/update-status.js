const { getDB, ensureTable } = require('./_db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mb-customer-req-2024-secret';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  await ensureTable();
  const db = getDB();

  // Verify JWT
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  let user;
  try {
    user = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const { id, fulfillmentStatus } = req.body || {};
    if (!id || !fulfillmentStatus) return res.json({ success: false, error: 'Entry ID and status are required' });
    if (!['Fulfilled', 'Not_Fulfilled', 'Pending'].includes(fulfillmentStatus)) return res.json({ success: false, error: 'Invalid status value' });

    const entryResult = await db.execute({ sql: 'SELECT * FROM entries WHERE id = ?', args: [id] });
    if (!entryResult.rows.length) return res.json({ success: false, error: 'Entry not found' });

    const entry = entryResult.rows[0];
    const isOwner = String(entry.employee_id) === String(user.empCode) || Number(entry.submitted_by) === Number(user.empCode);
    const isManager = user.role === 'manager';
    if (!isOwner && !isManager) return res.json({ success: false, error: 'Permission denied' });

    await db.execute({ sql: 'UPDATE entries SET fulfillment_status = ? WHERE id = ?', args: [fulfillmentStatus, id] });
    return res.json({ success: true });
  }

  return res.status(400).json({ error: 'Invalid request method' });
};
