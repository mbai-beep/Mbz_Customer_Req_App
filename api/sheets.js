const { google } = require('googleapis');

const HEADERS = [
  'id','customer_name','mobile_number','store_name','store_code',
  'requirement','employee','employee_id','created_at','status',
  'has_voice','voice_duration','photo_count','photo_urls','audio_url',
  'fulfillment_status','submitted_by'
];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  const entry = req.body;
  if (!entry || !entry.id) {
    return res.status(400).json({ error: 'Entry data required' });
  }
  try {
    let credentials;
    try {
      const raw = process.env.GOOGLE_SERVICE_ACCOUNT || '{}';
      const fixed = raw.replace(/\\n/g, '\n');
      credentials = JSON.parse(fixed);
    } catch (e) {
      return res.status(500).json({ error: 'Invalid GOOGLE_SERVICE_ACCOUNT: ' + e.message });
    }
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      return res.status(500).json({ error: 'GOOGLE_SHEET_ID not set' });
    }
    // Check if header row exists; if not, write it first
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId, range: 'Sheet1!A1:Q1',
    });
    if (!existing.data.values || existing.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: 'Sheet1!A1',
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      });
    }
    // IST = UTC + 5:30
    const toIST = (dateStr) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
      const dd = String(ist.getUTCDate()).padStart(2, '0');
      const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = ist.getUTCFullYear();
      const hh = String(ist.getUTCHours()).padStart(2, '0');
      const mi = String(ist.getUTCMinutes()).padStart(2, '0');
      const ss = String(ist.getUTCSeconds()).padStart(2, '0');
      return `${dd}-${mm}-${yyyy} ${hh}:${mi}:${ss}`;
    };
    // Columns: id,customer_name,mobile_number,store_name,store_code,
    //          requirement,employee,employee_id,created_at,status,
    //          has_voice,voice_duration,photo_count,photo_urls,audio_url,
    //          fulfillment_status,submitted_by
    const row = [
      entry.id || '',
      entry.customer_name || '',
      entry.mobile_number || '',
      entry.store_name || '',
      entry.store_code || '',
      entry.requirement || '',
      entry.employee || '',
      entry.employee_id || '',
      toIST(entry.created_at || entry.synced_at || entry.submitted_at),
      entry.status || '',
      entry.has_voice ? 'Yes' : 'No',
      entry.voice_duration || '',
      entry.photo_count || 0,
      Array.isArray(entry.photo_urls) ? entry.photo_urls.join(', ') : (entry.photo_urls || ''),
      entry.audio_url || '',
      entry.fulfillment_status || '',
      entry.submitted_by || '',
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};const { google } = require('googleapis');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  const entry = req.body;
  if (!entry || !entry.id) {
    return res.status(400).json({ error: 'Entry data required' });
  }
  try {
    let credentials;
    try {
      const raw = process.env.GOOGLE_SERVICE_ACCOUNT || '{}';
      const fixed = raw.replace(/\\n/g, '\n');
      credentials = JSON.parse(fixed);
    } catch (e) {
      return res.status(500).json({ error: 'Invalid GOOGLE_SERVICE_ACCOUNT: ' + e.message });
    }
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      return res.status(500).json({ error: 'GOOGLE_SHEET_ID not set' });
    }
    // IST = UTC + 5:30
    const toIST = (dateStr) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      const istDate = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
      const dd = String(istDate.getUTCDate()).padStart(2, '0');
      const mm = String(istDate.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = istDate.getUTCFullYear();
      const hh = String(istDate.getUTCHours()).padStart(2, '0');
      const min = String(istDate.getUTCMinutes()).padStart(2, '0');
      const ss = String(istDate.getUTCSeconds()).padStart(2, '0');
      return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}`;
    };
    // Column order: id, customer_name, mobile_number, store_name, store_code,
    // requirement, employee, employee_id, created_at, status, has_voice,
    // voice_duration, photo_count, photo_urls, audio_url, fulfillment_status, submitted_by
    const row = [
      entry.id || '',
      entry.customer_name || '',
      entry.mobile_number || '',
      entry.store_name || '',
      entry.store_code || '',
      entry.requirement || '',
      entry.employee || '',
      entry.employee_id || '',
      toIST(entry.created_at || entry.synced_at || entry.submitted_at),
      entry.status || '',
      entry.has_voice ? 'Yes' : 'No',
      entry.voice_duration || '',
      entry.photo_count || 0,
      Array.isArray(entry.photo_urls) ? entry.photo_urls.join(', ') : (entry.photo_urls || ''),
      entry.audio_url || '',
      entry.fulfillment_status || '',
      entry.submitted_by || '',
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
