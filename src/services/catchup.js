const { fetchPendingBatches } = require('./wpClient');
const { enqueueBatch } = require('./emailQueue');

const CATCHUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Periodically poll WordPress for batches stuck in 'created' or 'sending' status.
 * Handles cases where the webhook was missed (TNS was down, network issue, etc.).
 */
function startCatchupLoop() {
  if (!process.env.WP_API_URL) {
    console.log('[TNS] Catch-up disabled — WP_API_URL not configured');
    return;
  }

  console.log(`[TNS] Catch-up loop started (every ${CATCHUP_INTERVAL_MS / 1000}s)`);

  setInterval(async () => {
    try {
      const data = await fetchPendingBatches();
      const batches = data?.batches || [];

      if (batches.length > 0) {
        console.log(`[TNS] Catch-up found ${batches.length} pending batch(es)`);
        for (const batch of batches) {
          console.log(`[TNS] Catch-up: queuing batch #${batch.comp_post_id} (${batch.tickets.length} tickets)`);
          enqueueBatch(batch);
        }
      }
    } catch (err) {
      console.error('[TNS] Catch-up error:', err.message);
    }
  }, CATCHUP_INTERVAL_MS);
}

/**
 * Run catch-up once immediately (called from /api/catch-up endpoint).
 */
async function runCatchupNow() {
  const data = await fetchPendingBatches();
  const batches = data?.batches || [];

  let totalQueued = 0;
  for (const batch of batches) {
    enqueueBatch(batch);
    totalQueued += batch.tickets.length;
  }

  return { batches_found: batches.length, tickets_queued: totalQueued };
}

module.exports = { startCatchupLoop, runCatchupNow };
