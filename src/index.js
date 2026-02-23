require('dotenv').config();
const express = require('express');
const healthRoutes = require('./routes/health');
const batchRoutes = require('./routes/batch');
const notifyRoutes = require('./routes/notify');
const { router: pdfRoutes } = require('./routes/pdf');
const { authMiddleware } = require('./middleware/auth');
const { startCatchupLoop } = require('./services/catchup');

const { drainQueue } = require('./services/emailQueue');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json({ limit: '5mb' }));

app.use('/api', healthRoutes);
app.use('/api', pdfRoutes);

// Protected routes
app.use('/api', authMiddleware, batchRoutes);
app.use('/api', authMiddleware, notifyRoutes);

app.use((err, _req, res, _next) => {
  console.error('[TNS] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server and catchup loop
const server = app.listen(PORT, () => {
  console.log(`[TNS] listening on port ${PORT}`);
  console.log(`[TNS] WP API: ${process.env.WP_API_URL || '(not configured)'}`);
  console.log(`[TNS] SES sender: ${process.env.SES_SENDER_EMAIL || '(not configured)'}`);
  startCatchupLoop();
});

// Graceful shutdown — drain in-flight emails before exiting
async function shutdown(signal) {
  console.log(`[TNS] ${signal} received — shutting down gracefully...`);
  server.close();
  await drainQueue();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
