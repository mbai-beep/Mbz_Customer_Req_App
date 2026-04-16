const { google } = require('googleapis');
const { Readable } = require('stream');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileData, fileName, mimeType } = req.body;
    if (!fileData || !fileName) return res.status(400).json({ error: 'Missing fileData or fileName' });

    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}');
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    const drive = google.drive({ version: 'v3', auth });

    // Convert base64 to buffer
    const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const buffer = Buffer.from(base64Data, 'base64');
    const stream = Readable.from(buffer);

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const fileMetadata = { name: fileName, ...(folderId ? { parents: [folderId] } : {}) };
    const media = { mimeType: mimeType || 'application/octet-stream', body: stream };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, webViewLink, webContentLink'
    });

    // Make publicly readable
    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: { role: 'reader', type: 'anyone' }
    });

    const directUrl = `https://drive.google.com/uc?export=view&id=${file.data.id}`;
    res.json({ success: true, fileId: file.data.id, url: file.data.webViewLink, directUrl });
  } catch (err) {
    console.error('Drive upload error:', err);
    res.status(500).json({ error: err.message });
  }
};
