const { getDB, ensureTable } = require('./_db');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');

const JWT_SECRET = process.env.JWT_SECRET || 'mb-customer-req-2024-secret';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
const PRIVILEGED = ['admin', 'owner', 'buyer', 'manager'];

function toColLetter(idx) {
  let s = '';
  for (let n = idx + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

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

async function updateSheetRow(entryId, fulfillmentStatus, challanNumber) {
  const sheets = await getSheetsClient();
  if (!sheets) return;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  try {
    const [headerResp, idResp] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Sheet1!1:1' }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Sheet1!A:A' })
    ]);
    const headers = (headerResp.data.values && headerResp.data.values[0]) || [];
    const ids = (idResp.data.values || []).map(r => r[0] || '');
    const rowIndex = ids.indexOf(entryId);
    if (rowIndex <= 0) return;
    let fsCol = headers.indexOf('fulfillment_status');
    if (fsCol === -1) fsCol = 10;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Sheet1!${toColLetter(fsCol)}${rowIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[fulfillmentStatus]] }
    });
    if (challanNumber) {
      let cnCol = headers.indexOf('challan_number');
      if (cnCol === -1) {
        cnCol = headers.length;
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Sheet1!${toColLetter(cnCol)}1`,
          valueInputOption: 'RAW',
          requestBody: { values: [['challan_number']] }
        });
      }
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Sheet1!${toColLetter(cnCol)}${rowIndex + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[challanNumber]] }
      });
    }
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

    updateSheetRow(id, fulfillmentStatus, challanNumber).catch(() => {});
    return res.json({ success: true });
  }

  return res.status(400).json({ error: 'Invalid request method' });
};
