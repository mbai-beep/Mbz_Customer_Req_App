const { getDB, ensureTable } = require('./_db');

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
    syncedAt: r.synced_at
  };
}

module.exports = async function handler(req, res) {
  await ensureTable();
  const db = getDB();

  if (req.method === 'GET') {
    const result = await db.execute('SELECT * FROM entries ORDER BY created_at DESC LIMIT 500');
    return res.json(result.rows.map(mapRow));
  }

  if (req.method === 'POST') {
    const b = req.body;
    const photoUrlsJson = JSON.stringify(Array.isArray(b.photoUrls) ? b.photoUrls : []);
    await db.execute({
      sql: `INSERT OR REPLACE INTO entries
        (id, customer_name, mobile_number, store_name, store_code, requirement, description,
         employee, employee_id, created_at, status, has_voice, voice_duration,
         photo_count, photo_urls, audio_url, synced_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        b.id, b.customerName, b.mobileNumber, b.storeName,
        b.storeCode || '', b.requirement || '', b.description || '',
        b.employee, b.employeeId || '', b.createdAt,
        b.status || 'new', b.hasVoice ? 1 : 0,
        b.voiceDuration || '', b.photoCount || 0,
        photoUrlsJson, b.audioUrl || '', new Date().toISOString()
      ]
    });
    return res.json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
