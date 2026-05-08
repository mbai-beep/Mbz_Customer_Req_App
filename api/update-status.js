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

// 0-based column indices matching entries.js appendToSheet row order:
// A=id, B=customerName, C=mobile, D=storeName, E=storeCode, F=requirement,
// G=description, H=employee, I=employeeId, J=createdAt,
// K(10)=fulfillment_status, L=hasVoice, M=voiceDuration, N=photoCount,
// O=photoUrls, P=audioUrl, Q=synced_at, R=submittedBy, S=requirementType,
// T(19)=challan_number
const COL_FULFILLMENT = 10; // K
const COL_CHALLAN     = 19; // T

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
    if (!sa) throw new Error('Could not parse service account credentials');
    const auth = new google.auth.GoogleAuth({
      credentials: sa,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    return google.sheets({ version: 'v4', auth });
  } catch(e) {
    console.error('Sheets auth error:', e.message);
    return null;
  }
}

// Fetch the actual first sheet tab name — avoids hardcoding "Sheet1"
async function getFirstSheetName(sheets, spreadsheetId) {
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties.title'
    });
    const list = (meta.data.sheets || []);
    if (list.length) return list[0].properties.title;
  } catch(e) {
    console.error('getFirstSheetName error:', e.message);
  }
  return 'Sheet1';
}

// Returns { ok: boolean, error: string|null }
async function updateSheetRow(entryId, fulfillmentStatus, challanNumber) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_B64 && !process.env.GOOGLE_SERVICE_ACCOUNT) {
    return { ok: false, error: 'Sheets not configured: missing credentials env var' };
  }
  if (!process.env.GOOGLE_SHEET_ID) {
    return { ok: false, error: 'Sheets not configured: missing GOOGLE_SHEET_ID env var' };
  }

  const sheets = await getSheetsClient();
  if (!sheets) return { ok: false, error: 'Failed to initialise Google Sheets client (check credentials)' };

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  try {
    const sheetName = await getFirstSheetName(sheets, spreadsheetId);

    // Fetch all IDs in column A
    const idResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:A`
    });

    const ids = (idResp.data.values || []).map(r => (r[0] || '').toString().trim());
    const rowIndex = ids.indexOf(String(entryId).trim()); // 0-based

    if (rowIndex < 0) {
      return {
        ok: false,
        error: `Entry ID "${entryId}" not found in sheet "${sheetName}" (${ids.length} rows scanned)`
      };
    }

    const sheetRow = rowIndex + 1; // 1-based for Sheets API

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          {
            range: `${sheetName}!${toColLetter(COL_FULFILLMENT)}${sheetRow}`,
            values: [[fulfillmentStatus]]
          },
          {
            range: `${sheetName}!${toColLetter(COL_CHALLAN)}${sheetRow}`,
            values: [[challanNumber || '']]
          }
        ]
      }
    });

    return { ok: true, error: null };
  } catch(e) {
    const msg = (e.message || 'Unknown Sheets error');
    console.error('Sheet update-status error:', msg);
    return { ok: false, error: msg };
  }
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
    const isOwner = String(entry.employee_id) === String(user.empCode) ||
                    Number(entry.submitted_by) === Number(user.empCode);
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

    // Await sheet sync so we can report its result
    const sheetResult = await updateSheetRow(id, fulfillmentStatus, challanNumber || '');

    return res.json({
      success: true,
      sheetSynced: sheetResult.ok,
      sheetError: sheetResult.error || null
    });
  }

  return res.status(400).json({ error: 'Invalid request method' });
};
