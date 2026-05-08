const { getDB, ensureTable } = require('./_db');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');

const JWT_SECRET = process.env.JWT_SECRET || 'mb-customer-req-2024-secret';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
const PRIVILEGED = ['admin', 'owner', 'buyer', 'manager', 'merchandiser'];

// Fixed sheet column indices (0-based, A=0)
const FULFILLMENT_COL = 10; // Column K
const CHALLAN_COL     = 19; // Column T

function toColLetter(idx) {
  let s = '';
  for (let n = idx + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

function toIST(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const p = n => String(n).padStart(2, '0');
  return p(ist.getUTCDate()) + '-' + p(ist.getUTCMonth()+1) + '-' + ist.getUTCFullYear() + ' ' + p(ist.getUTCHours()) + ':' + p(ist.getUTCMinutes()) + ':' + p(ist.getUTCSeconds());
}
function nowIST() { return toIST(new Date().toISOString()); }

async function getSheetsClient() {
  const saRaw = process.env.GOOGLE_SERVICE_ACCOUNT_B64 || process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!saRaw || !process.env.GOOGLE_SHEET_ID) return null;
  try {
    let sa;
    try { sa = JSON.parse(Buffer.from(saRaw, 'base64').toString('utf8')); } catch(e) {}
    if (!sa) try { sa = JSON.parse(saRaw); } catch(e) {}
    const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    return google.sheets({ version: 'v4', auth });
  } catch(e) { return null; }
}

function buildSheetRow(entry, fulfillmentStatus, challanNumber) {
  const req = (() => {
    try {
      if (typeof entry.requirement === 'string' && entry.requirement.startsWith('{')) {
        const p = JSON.parse(entry.requirement);
        return Object.entries(p).map(([k,v]) => k + ': ' + (Array.isArray(v)?v.join(', '):v)).join(' | ');
      }
    } catch(e) {}
    return entry.requirement || '';
  })();
  let photoUrls = [];
  try { photoUrls = JSON.parse(entry.photo_urls || '[]'); } catch(e) {}
  return [
    entry.id,                                        // A (0)
    entry.customer_name,                             // B (1)
    entry.mobile_number,                             // C (2)
    entry.store_name,                                // D (3)
    entry.store_code || '',                          // E (4)
    req,                                             // F (5)
    entry.description || '',                         // G (6)
    entry.employee,                                  // H (7)
    entry.employee_id || '',                         // I (8)
    toIST(entry.created_at),                         // J (9)
    fulfillmentStatus,                               // K (10) fulfillment_status
    entry.has_voice ? 'Yes' : 'No',                 // L (11)
    entry.voice_duration || '',                      // M (12)
    entry.photo_count || 0,                          // N (13)
    photoUrls.join(', '),                            // O (14)
    entry.audio_url || '',                           // P (15)
    nowIST(),                                        // Q (16) synced_at
    entry.submitted_by || '',                        // R (17)
    entry.requirement_type || 'New',                 // S (18)
    challanNumber || entry.challan_number || ''      // T (19) challan_number
  ];
}

async function updateSheetRow(entryId, fulfillmentStatus, challanNumber, entryData) {
  const sheets = await getSheetsClient();
  if (!sheets) return;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  try {
    const idResp = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Sheet1!A:A' });
    const ids = (idResp.data.values || []).map(r => (r[0] || '').trim());
    const rowIndex = ids.indexOf(String(entryId).trim());

    if (rowIndex < 0) {
      // Entry not in sheet — append full row as fallback
      if (!entryData) return;
      const row = buildSheetRow(entryData, fulfillmentStatus, challanNumber);
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Sheet1!A:T',
        valueInputOption: 'RAW',
        requestBody: { values: [row] }
      });
      return;
    }

    const sheetRow = rowIndex + 1;
    // Batch-update fulfillment_status (K) and challan_number (T) atomically
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'Sheet1!' + toColLetter(FULFILLMENT_COL) + sheetRow, values: [[fulfillmentStatus]] },
          { range: 'Sheet1!' + toColLetter(CHALLAN_COL)     + sheetRow, values: [[challanNumber || '']] }
        ]
      }
    });
  } catch(e) { console.error('Sheet update-status error:', e.message); }
}

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  await ensureTable();
  const db = getDB();

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  let user;
  try {
    user = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const { id, fulfillmentStatus, challanNumber } = req.body || {};
    if (!id || !fulfillmentStatus)
      return res.json({ success: false, error: 'Entry ID and status are required' });
    if (!['Fulfilled', 'Not_Fulfilled', 'Pending'].includes(fulfillmentStatus))
      return res.json({ success: false, error: 'Invalid status value' });
    if (fulfillmentStatus === 'Fulfilled' && !challanNumber)
      return res.json({ success: false, error: 'Reference/Challan Number is required to mark as Fulfilled' });

    const entryResult = await db.execute({ sql: 'SELECT * FROM entries WHERE id = ?', args: [id] });
    if (!entryResult.rows.length) return res.json({ success: false, error: 'Entry not found' });

    const entry = entryResult.rows[0];
    const isOwner = String(entry.employee_id) === String(user.empCode) || Number(entry.submitted_by) === Number(user.empCode);
    const isPrivileged = PRIVILEGED.includes(user.role);
    if (!isOwner && !isPrivileged) return res.json({ success: false, error: 'Permission denied' });

    if (challanNumber) {
      await db.execute({
        sql: 'UPDATE entries SET fulfillment_status = ?, challan_number = ? WHERE id = ?',
        args: [fulfillmentStatus, challanNumber, id]
      });
    } else {
      await db.execute({
        sql: 'UPDATE entries SET fulfillment_status = ? WHERE id = ?',
        args: [fulfillmentStatus, id]
      });
    }

    // Async sheet update — pass entry data so we can append if not found in sheet
    updateSheetRow(id, fulfillmentStatus, challanNumber || '', entry).catch(() => {});
    return res.json({ success: true });
  }

  return res.status(400).json({ error: 'Invalid request method' });
};
