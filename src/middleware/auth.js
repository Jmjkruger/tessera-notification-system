function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-tns-key'] || req.body?.api_key;
  const expectedKey = process.env.TNS_API_KEY;

  if (!expectedKey) {
    console.error('[TNS] TNS_API_KEY not configured');
    return res.status(500).json({ error: 'TNS_API_KEY not configured on server' });
  }

  if (!apiKey || apiKey !== expectedKey) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }

  next();
}

module.exports = { authMiddleware };
