const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { entry } = req.body;

    if (!entry) {
      return res.status(400).json({ error: 'Missing entry' });
    }

    // Parse service account - handle literal newlines in Vercel env vars
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    } catch (e) {
      serviceAccount = JSON.parse(
        process.env.GOOGLE_SERVICE_ACCOUNT.replace(/\n/g, '\\n').replace(/\r/g, '')
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const checkRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A1:A1',
    });

    const hasHeader = checkRes.data.values && checkRes.data.values.length > 0;

    const headers = [
      'ID', 'Customer Name', 'Mobile Number', 'Store Name', 'Store Code',
      'Requirement', 'Employee', 'Employee ID', 'Created At', 'Status',
      'Has Voice', 'Voice Duration', 'Photo Count', 'Photo URLs', 'Audio URL',
    ];

    const row = [
      entry.id || '',
      entry.customerName || '',
      entry.mobileNumber || '',
      entry.storeName || '',
      entry.storeCode || '',
      entry.requirement || entry.description || '',
      entry.employee || '',
      entry.employeeId || '',
      entry.createdAt || '',
      entry.status || 'new',
      entry.hasVoice ? 'Yes' : 'No',
      entry.voiceDuration || '',
      String(entry.photoCount || 0),
      Array.isArray(entry.photoUrls) ? entry.photoUrls.join(', ') : (entry.photoUrls || ''),
      entry.audioUrl || '',
    ];

    const valuesToAppend = hasHeader ? [row] : [headers, row];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: valuesToAppend },
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Sheets error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
