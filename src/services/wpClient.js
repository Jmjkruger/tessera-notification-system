/**
 * WordPress REST API client for updating ticket email status.
 * Calls back to the WP plugin's TNS status endpoint.
 *
 * Accepts an optional baseUrl override per-batch (sent by WP in the webhook payload).
 * Falls back to WP_API_URL from .env if not provided.
 */

const getDefaultBaseUrl = () => process.env.WP_API_URL;
const getApiKey = () => process.env.TNS_API_KEY;

async function updateTicketEmailStatus(ticketId, status, compPostId, baseUrl) {
  const wpUrl = baseUrl || getDefaultBaseUrl();
  const url = `${wpUrl}/tessera/v1/tns/update-status`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TNS-Key': getApiKey(),
    },
    body: JSON.stringify({
      ticket_id: ticketId,
      status,
      comp_post_id: compPostId,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WP status update failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Fetch batches stuck in 'sending' status for catch-up processing.
 * Always uses the .env base URL (catch-up is not per-batch).
 */
async function fetchPendingBatches() {
  const url = `${getDefaultBaseUrl()}/tessera/v1/tns/pending-batches`;

  const res = await fetch(url, {
    headers: { 'X-TNS-Key': getApiKey() },
  });

  if (!res.ok) {
    throw new Error(`WP pending batches fetch failed (${res.status})`);
  }

  return res.json();
}

module.exports = { updateTicketEmailStatus, fetchPendingBatches };
