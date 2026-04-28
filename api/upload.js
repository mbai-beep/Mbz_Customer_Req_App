const { google } = require('googleapis');
const { Readable } = require('stream');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function getServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_B64 || process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT env var');
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch(e) {}
  try { return JSON.parse(raw); } catch(e) {}
  return JSON.parse(raw.replace(/\\n/g, '\n'));
}

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileData, fileName, mimeType } = req.body || {};
    if (!fileData || !fileName) return res.status(400).json({ error: 'Missing fileData or fileName' });

    const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const buffer = Buffer.from(base64Data, 'base64');

    const auth = new google.auth.GoogleAuth({
      credentials: getServiceAccount(),
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = google.drive({ version: 'v3', auth });

    const rawFolderId = (process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
    const folderId = rawFolderId.replace(/^[^0-9A-Za-z]+/, '');

    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const uploadRes = await drive.files.create({
      requestBody: { name: fileName, mimeType: mimeType || 'application/octet-stream', parents: folderId ? [folderId] : [] },
      media: { mimeType: mimeType || 'application/octet-stream', body: stream },
      fields: 'id',
      supportsAllDrives: true,
    });

    const fileId = uploadRes.data.id;
    await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' }, supportsAllDrives: true });

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const url = (mimeType && mimeType.startsWith('image/'))
      ? 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800'
      : proto + '://' + host + '/api/file?id=' + fileId;

    return res.status(200).json({ url, fileId });
  } catch (err) {
    console.error('Upload error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
