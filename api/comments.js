const { getDB, ensureTable } = require('./_db');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');

const JWT_SECRET = process.env.JWT_SECRET || 'mb-customer-req-2024-secret';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const COL_REMARKS = 20; // Column U (0-based)

function toColLetter(idx) {
  let s = '';
  for (let n = idx + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

function nowIST() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const p = n => String(n).padStart(2, '0');
  return p(ist.getUTCDate())+'-'+p(ist.getUTCMonth()+1)+'-'+ist.getUTCFullYear()+' '+p(ist.getUTCHours())+':'+p(ist.getUTCMinutes())+':'+p(ist.getUTCSeconds());
}

async function getSheetsClient() {
  const saRaw = process.env.GOOGLE_SERVICE_ACCOUNT_B64 || process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!saRaw || !process.env.GOOGLE_SHEET_ID) return null;
  try {
    let sa;
    try { sa = JSON.parse(Buffer.from(saRaw, 'base64').toString('utf8')); } catch(e) {}
    if (!sa) try { sa = JSON.parse(saRaw); } catch(e) {}
    if (!sa) throw new Error('Could not parse credentials');
    const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    return google.sheets({ version: 'v4', auth });
  } catch(e) { console.error('Sheets auth error:', e.message); return null; }
}

async function getFirstSheetName(sheets, spreadsheetId) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
    const list = meta.data.sheets || [];
    if (list.length) return list[0].properties.title;
  } catch(e) {}
  return 'Sheet1';
}

async function syncRemarksToSheet(entryId, db) {
  const sheets = await getSheetsClient();
  if (!sheets) return;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  try {
    const cResult = await db.execute({ sql: 'SELECT commenter_name, comment FROM comments WHERE entry_id = ? ORDER BY created_at ASC', args: [entryId] });
    const combined = cResult.rows.map(r => r.commenter_name + ': ' + r.comment).join(' | ');
    const sheetName = await getFirstSheetName(sheets, spreadsheetId);
    const idResp = await sheets.spreadsheets.values.get({ spreadsheetId, range: sheetName+'!A:A' });
    const ids = (idResp.data.values || []).map(r => (r[0] || '').toString().trim());
    const rowIndex = ids.indexOf(String(entryId).trim());
    if (rowIndex < 0) return;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: sheetName+'!'+toColLetter(COL_REMARKS)+(rowIndex+1),
      valueInputOption: 'RAW',
      requestBody: { values: [[combined]] }
    });
  } catch(e) { console.error('Sheet remarks sync error:', e.message); }
}

async function ensureCommentsTable(db) {
  await db.execute("CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, entry_id TEXT NOT NULL, commenter_name TEXT NOT NULL, commenter_id TEXT NOT NULL, commenter_role TEXT DEFAULT 'employee', comment TEXT NOT NULL, created_at TEXT NOT NULL)");
}

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  await ensureTable();
  const db = getDB();
  await ensureCommentsTable(db);
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  let user;
  try { user = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Invalid or expired token' }); }

  if (req.method === 'GET') {
    const { entryId, action, ids } = req.query;
    if (action === 'counts' && ids) {
      const idList = ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);
      const counts = {};
      for (const id of idList) {
        const r = await db.execute({ sql: 'SELECT COUNT(*) as cnt FROM comments WHERE entry_id = ?', args: [id] });
        counts[id] = Number(r.rows[0]?.cnt || 0);
      }
      return res.json(counts);
    }
    if (!entryId) return res.json([]);
    const result = await db.execute({ sql: 'SELECT * FROM comments WHERE entry_id = ? ORDER BY created_at ASC', args: [entryId] });
    return res.json(result.rows);
  }

  if (req.method === 'POST') {
    const { entryId, comment } = req.body || {};
    if (!entryId || !comment || !String(comment).trim())
      return res.json({ success: false, error: 'Entry ID and comment are required' });
    const id = 'cmt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const commenterName = user.empName || user.name || ('User ' + user.empCode);
    await db.execute({
      sql: 'INSERT INTO comments (id, entry_id, commenter_name, commenter_id, commenter_role, comment, created_at) VALUES (?,?,?,?,?,?,?)',
      args: [id, entryId, commenterName, String(user.empCode), user.role || 'employee', String(comment).trim(), nowIST()]
    });
    syncRemarksToSheet(entryId, db).catch(() => {});
    return res.json({ success: true, id });
  }

  if (req.method === 'DELETE') {
    if (user.role !== 'admin') return res.status(403).json({ error: 'Only admin can delete comments' });
    const { id } = req.query;
    if (!id) return res.json({ success: false, error: 'Comment ID required' });
    const existing = await db.execute({ sql: 'SELECT entry_id FROM comments WHERE id = ?', args: [id] });
    if (!existing.rows.length) return res.json({ success: false, error: 'Comment not found' });
    const entryId = existing.rows[0].entry_id;
    await db.execute({ sql: 'DELETE FROM comments WHERE id = ?', args: [id] });
    syncRemarksToSheet(entryId, db).catch(() => {});
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
