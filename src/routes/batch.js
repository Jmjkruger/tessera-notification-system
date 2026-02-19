const { Router } = require('express');
const { enqueueBatch, getQueueStats } = require('../services/emailQueue');
const { runCatchupNow } = require('../services/catchup');
const router = Router();

/**
 * POST /api/send-batch
 * Webhook receiver — called by the WordPress plugin after comp tickets are created.
 * Accepts batch data and queues emails for delivery.
 */
router.post('/send-batch', async (req, res) => {
  try {
    const { comp_post_id, event, tickets, wp_api_url } = req.body;

    if (!comp_post_id || !event || !Array.isArray(tickets) || tickets.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: comp_post_id, event, tickets[]',
      });
    }

    if (!event.name || !event.id) {
      return res.status(400).json({ error: 'Event must include id and name' });
    }

    console.log(`[TNS] Received batch #${comp_post_id}: ${tickets.length} ticket(s) for "${event.name}"${wp_api_url ? ` (callback: ${wp_api_url})` : ''}`);

    enqueueBatch({ comp_post_id, event, tickets, wp_api_url });

    res.status(202).json({
      accepted: true,
      comp_post_id,
      tickets_queued: tickets.length,
      message: `${tickets.length} email(s) queued for delivery`,
    });
  } catch (err) {
    console.error('[TNS] Error in /send-batch:', err);
    res.status(500).json({ error: 'Failed to queue batch' });
  }
});

/**
 * POST /api/retry-batch
 * Manually retry a batch that had failures.
 * Called from orgdash SentCompsTab retry button via WP plugin.
 */
router.post('/retry-batch', async (req, res) => {
  try {
    const { comp_post_id, event, tickets, wp_api_url } = req.body;

    if (!comp_post_id || !event || !Array.isArray(tickets) || tickets.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const failedOnly = tickets.filter((t) => t.status === 'failed' || t.status === 'not_sent');
    if (failedOnly.length === 0) {
      return res.json({ message: 'No failed tickets to retry', retried: 0 });
    }

    console.log(`[TNS] Retry batch #${comp_post_id}: ${failedOnly.length} ticket(s)`);

    enqueueBatch({ comp_post_id, event, tickets: failedOnly, wp_api_url });

    res.status(202).json({
      accepted: true,
      comp_post_id,
      tickets_queued: failedOnly.length,
    });
  } catch (err) {
    console.error('[TNS] Error in /retry-batch:', err);
    res.status(500).json({ error: 'Failed to queue retry' });
  }
});

/**
 * GET /api/queue-stats
 * Returns current queue status for monitoring.
 */
router.get('/queue-stats', (_req, res) => {
  res.json(getQueueStats());
});

/**
 * POST /api/catch-up
 * Manually trigger a catch-up — fetches pending batches from WP and queues them.
 */
router.post('/catch-up', async (_req, res) => {
  try {
    const result = await runCatchupNow();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[TNS] Manual catch-up failed:', err);
    res.status(500).json({ error: 'Catch-up failed', message: err.message });
  }
});

module.exports = router;
