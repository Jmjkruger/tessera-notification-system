require('dotenv').config();
const express = require('express');
const healthRoutes = require('./routes/health');
const batchRoutes = require('./routes/batch');
const notifyRoutes = require('./routes/notify');
const { authMiddleware } = require('./middleware/auth');
const { startCatchupLoop } = require('./services/catchup');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json({ limit: '5mb' }));

app.use('/api', healthRoutes);
app.use('/api', authMiddleware, batchRoutes);
app.use('/api', authMiddleware, notifyRoutes);

app.use((err, _req, res, _next) => {
  console.error('[TNS] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[TNS] Tessera Notification System running on port ${PORT}`);
  console.log(`[TNS] WP API: ${process.env.WP_API_URL || '(not configured)'}`);
  console.log(`[TNS] SES sender: ${process.env.SES_SENDER_EMAIL || '(not configured)'}`);
  startCatchupLoop();
});
