const { getDB, ensureTable } = require('./_db');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  await ensureTable();
  const db = getDB();

  const result = await db.execute(
    "SELECT DISTINCT store_code, store_name FROM employees WHERE store_status = 'Active' AND store_code != '' ORDER BY store_name"
  );

  const seen = new Set();
  const stores = [];
  for (const r of result.rows) {
    if (!seen.has(r.store_code)) {
      seen.add(r.store_code);
      stores.push({ code: r.store_code, name: r.store_name });
    }
  }

  return res.json({ success: true, stores });
};
