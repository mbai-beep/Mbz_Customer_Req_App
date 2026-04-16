const { google } = require('googleapis');
const { Readable } = require('stream');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileData, fileName, mimeType } = req.body;

    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'Missing fileData or fileName' });
    }

    // Strip base64 data URI prefix: "data:image/jpeg;base64,XXX" -> "XXX"
    const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const buffer = Buffer.from(base64Data, 'base64');

    // Parse service account JSON from env var
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // Create a readable stream from the buffer
    const bufferStream = new Readable();
    bufferStream.push(buffer);
    bufferStream.push(null);

    // Upload file to Google Drive
    const uploadRes = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: mimeType || 'application/octet-stream',
        parents: [folderId],
      },
      media: {
        mimeType: mimeType || 'application/octet-stream',
        body: bufferStream,
      },
      fields: 'id',
    });

    const fileId = uploadRes.data.id;

    // Make the file publicly readable
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    const url = `https://drive.google.com/uc?id=${fileId}&export=view`;
    return res.status(200).json({ url, fileId });

  } catch (err) {
    console.error('Drive upload error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
