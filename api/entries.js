const { getDB, ensureTable } = require('./_db');
const { google } = require('googleapis');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function mapRow(r) {
  return {
    id: r.id,
    customerName: r.customer_name,
    mobileNumber: r.mobile_number,
    storeName: r.store_name,
    storeCode: r.store_code || '',
    requirement: r.requirement || '',
    description: r.description || '',
    employee: r.employee,
    employeeId: r.employee_id || '',
    createdAt: r.created_at,
    status: r.status || 'new',
    hasVoice: !!r.has_voice,
    voiceDuration: r.voice_duration || '',
    photoCount: r.photo_count || 0,
    photoUrls: (() => { try { return JSON.parse(r.photo_urls || '[]'); } catch(e) { return []; } })(),
    audioUrl: r.audio_url || '',
    syncedAt: r.synced_at,
    fulfillmentStatus: r.fulfillment_status || 'Pending',
    submittedBy: r.submitted_by || 0
  };
}

async function getSheetsClient() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT || !process.env.GOOGLE_SHEET_ID) return null;
  try {
    let sa;
    try { sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); }
    catch { sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT.replace(/\n/g, '\\n').replace(/\r/g, '')); }
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
function toIST(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = ist.getUTCFullYear();
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const mi = String(ist.getUTCMinutes()).padStart(2, '0');
  const ss = String(ist.getUTCSeconds()).padStart(2, '0');
  return dd + '-' + mm + '-' + yyyy + ' ' + hh + ':' + mi + ':' + ss;
}

async function appendToSheet(entry) {
  const sheets = await getSheetsClient();
  if (!sheets) return;
  try {
    const req = typeof entry.requirement === 'string' && entry.requirement.startsWith('{')
      ? (() => { try { const p = JSON.parse(entry.requirement); return Object.entries(p).map(([k,v]) => `${k}: ${Array.isArray(v)?v.join(', '):v}`).join(' | '); } catch { return entry.requirement; } })()
      : entry.requirement;
    const row = [
      entry.id, entry.customerName, entry.mobileNumber, entry.storeName, entry.storeCode,
      req, entry.description, entry.employee, entry.employeeId, toIST(entry.createdAt),
      'Pending', entry.hasVoice ? 'Yes' : 'No', entry.voiceDuration,
      entry.photoCount, (entry.photoUrls||[]).join(', '), entry.audioUrl,
      new Date().toISOString(), entry.submittedBy || ''
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Sheet1!A:R',
      valueInputOption: 'RAW',
      requestBody: { values: [row] }
    });
  } catch(e) { console.error('Sheet append error:', e.message); }
}

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  await ensureTable();
  const db = getDB();

  if (req.method === 'GET') {
    const { empCode, role } = req.query;
    let sql = 'SELECT * FROM entries ORDER BY created_at DESC LIMIT 500';
    let args = [];
    // If employee (not manager), filter to their own submissions
    if (empCode && role === 'employee') {
      sql = 'SELECT * FROM entries WHERE submitted_by = ? OR employee_id = ? ORDER BY created_at DESC LIMIT 500';
      args = [parseInt(empCode), String(empCode)];
    }
    const result = await db.execute({ sql, args });
    return res.json(result.rows.map(mapRow));
  }

  if (req.method === 'POST') {
    const b = req.body;
    const photoUrlsJson = JSON.stringify(Array.isArray(b.photoUrls) ? b.photoUrls : []);
    await db.execute({
      sql: `INSERT OR REPLACE INTO entries
        (id, customer_name, mobile_number, store_name, store_code, requirement, description,
         employee, employee_id, created_at, status, has_voice, voice_duration,
         photo_count, photo_urls, audio_url, synced_at, fulfillment_status, submitted_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        b.id, b.customerName, b.mobileNumber, b.storeName,
        b.storeCode || '', b.requirement || '', b.description || '',
        b.employee, b.employeeId || '', b.createdAt,
        b.status || 'new', b.hasVoice ? 1 : 0,
        b.voiceDuration || '', b.photoCount || 0,
        photoUrlsJson, b.audioUrl || '', new Date().toISOString(),
        b.fulfillmentStatus || 'Pending', b.submittedBy || 0
      ]
    });
    // Async sheet append (don't block response)
    appendToSheet({ ...b, photoUrls: Array.isArray(b.photoUrls) ? b.photoUrls : [] }).catch(() => {});
    return res.json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
