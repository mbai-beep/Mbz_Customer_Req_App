module.exports = async function handler(req, res) {
  try {
    let sa;
    try { sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT); }
    catch { sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT.replace(/\n/g, '\\n').replace(/\r/g, '')); }
    return res.status(200).json({ client_email: sa.client_email, project_id: sa.project_id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
