/**
 * WordPress REST API client for updating ticket email status.
 * Calls back to the WP plugin's TNS status endpoint.
 */

const WP_API_URL = () => process.env.WP_API_URL;
const TNS_API_KEY = () => process.env.TNS_API_KEY;

async function updateTicketEmailStatus(ticketId, status, compPostId) {
  const url = `${WP_API_URL()}/tessera/v1/tns/update-status`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TNS-Key': TNS_API_KEY(),
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
 */
async function fetchPendingBatches() {
  const url = `${WP_API_URL()}/tessera/v1/tns/pending-batches`;

  const res = await fetch(url, {
    headers: { 'X-TNS-Key': TNS_API_KEY() },
  });

  if (!res.ok) {
    throw new Error(`WP pending batches fetch failed (${res.status})`);
  }

  return res.json();
}

module.exports = { updateTicketEmailStatus, fetchPendingBatches };
