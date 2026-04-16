const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { entry } = req.body;
    if (!entry) return res.status(400).json({ error: 'Missing entry' });

    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}');
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) return res.status(500).json({ error: 'GOOGLE_SHEET_ID not set' });

    // Check if header row exists
    const check = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A1'
    });
    const hasHeader = check.data.values && check.data.values[0] && check.data.values[0][0];

    if (!hasHeader) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'Sheet1!A1',
        valueInputOption: 'RAW',
        requestBody: { values: [['ID','Date','Customer Name','Mobile','Store Name','Store Code','Requirement','Description','Employee','Employee ID','Status','Photo Count','Photo URLs','Audio URL','Voice Duration']] }
      });
    }

    const photoUrls = Array.isArray(entry.photoUrls) ? entry.photoUrls.join(', ') : (entry.photoUrls || '');
    const row = [
      entry.id || '',
      entry.createdAt || '',
      entry.customerName || '',
      entry.mobileNumber || '',
      entry.storeName || '',
      entry.storeCode || '',
      entry.requirement || '',
      entry.description || '',
      entry.employee || '',
      entry.employeeId || '',
      entry.status || 'new',
      entry.photoCount || 0,
      photoUrls,
      entry.audioUrl || '',
      entry.voiceDuration || ''
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [row] }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Sheets sync error:', err);
    res.status(500).json({ error: err.message });
  }
};
