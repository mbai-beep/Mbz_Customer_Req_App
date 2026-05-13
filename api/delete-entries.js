const { getDB, ensureTable } = require('./_db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mb-customer-req-2024-secret';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  let user;
  try {
    user = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can delete entries' });
  }

  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.json({ success: false, error: 'No entry IDs provided' });
  }
  if (ids.length > 100) {
    return res.json({ success: false, error: 'Cannot delete more than 100 entries at once' });
  }

  await ensureTable();
  const db = getDB();

  try {
    let deleted = 0;
    for (const id of ids) {
      const r = await db.execute({ sql: 'DELETE FROM entries WHERE id = ?', args: [String(id)] });
      if (r.rowsAffected > 0) deleted++;
    }
    return res.json({ success: true, deleted });
  } catch(e) {
    console.error('delete-entries error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
};
