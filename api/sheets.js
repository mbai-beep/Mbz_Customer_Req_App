const { google } = require('googleapis');

const HEADERS = [
  'id','customer_name','mobile_number','store_name','store_code',
  'requirement','employee','employee_id','created_at','status',
  'has_voice','voice_duration','photo_count','photo_urls','audio_url',
  'fulfillment_status','submitted_by','requirement_type'
];

function getServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_B64 || process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT env var');
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch(e) {}
  try { return JSON.parse(raw); } catch(e) {}
  return JSON.parse(raw.replace(/\\n/g, '\n'));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  const entry = req.body;
  if (!entry || !entry.id) return res.status(400).json({ error: 'Entry data required' });

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: getServiceAccount(),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) throw new Error('Missing GOOGLE_SHEET_ID env var');

    // Ensure header row exists
    try {
      const headerCheck = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Sheet1!A1:R1' });
      const existingHeaders = headerCheck.data.values && headerCheck.data.values[0];
      if (!existingHeaders || existingHeaders.length === 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId, range: 'Sheet1!A1',
          valueInputOption: 'RAW',
          requestBody: { values: [HEADERS] },
        });
      }
    } catch(e) { /* header check failed, continue */ }

    // Append data row
    const row = HEADERS.map(h => {
      const val = entry[h];
      if (val === null || val === undefined) return '';
      if (Array.isArray(val)) return val.join(', ');
      return String(val);
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:R',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Sheets error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
