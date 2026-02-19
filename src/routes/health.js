const { Router } = require('express');
const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'tessera-notification-system',
    version: require('../../package.json').version,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
