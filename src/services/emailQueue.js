const { sendTicketEmail } = require('./sesClient');
const { updateTicketEmailStatus, updateBatchStatus } = require('./wpClient');
const { generateQR } = require('./qrGenerator');
const { renderCompTicketEmail } = require('./templateEngine');

const CONCURRENCY = 3;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

let activeWorkers = 0;
const queue = [];
const stats = { queued: 0, sent: 0, failed: 0, processing: 0 };

function getQueueStats() {
  return { ...stats, pending: queue.length, activeWorkers };
}

function enqueueBatch({ comp_post_id, event, tickets }) {
  for (const ticket of tickets) {
    queue.push({ comp_post_id, event, ticket, retries: 0 });
    stats.queued++;
  }
  drainQueue();
}

async function drainQueue() {
  while (queue.length > 0 && activeWorkers < CONCURRENCY) {
    const job = queue.shift();
    activeWorkers++;
    stats.processing++;
    processJob(job).finally(() => {
      activeWorkers--;
      stats.processing--;
      drainQueue();
    });
  }
}

async function processJob(job) {
  const { comp_post_id, event, ticket } = job;
  const ticketLabel = `ticket #${ticket.ticket_id} (${ticket.attendee_email})`;

  try {
    const qrDataUrl = await generateQR(ticket.barcode || `TESS-${ticket.ticket_id}`);

    const html = renderCompTicketEmail({
      event,
      ticket,
      qrDataUrl,
    });

    await sendTicketEmail({
      to: ticket.attendee_email,
      subject: `Your complimentary ticket for ${event.name}`,
      html,
    });

    await updateTicketEmailStatus(ticket.ticket_id, 'sent', comp_post_id);
    stats.sent++;
    console.log(`[TNS] Sent ${ticketLabel} for batch #${comp_post_id}`);
  } catch (err) {
    console.error(`[TNS] Failed ${ticketLabel}:`, err.message);

    if (job.retries < MAX_RETRIES) {
      job.retries++;
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, job.retries - 1);
      console.log(`[TNS] Retrying ${ticketLabel} (attempt ${job.retries}/${MAX_RETRIES}) in ${delay}ms`);
      setTimeout(() => {
        queue.push(job);
        drainQueue();
      }, delay);
    } else {
      console.error(`[TNS] Exhausted retries for ${ticketLabel}`);
      stats.failed++;
      try {
        await updateTicketEmailStatus(ticket.ticket_id, 'failed', comp_post_id);
      } catch (updateErr) {
        console.error(`[TNS] Failed to update status for ${ticketLabel}:`, updateErr.message);
      }
    }
  }
}

module.exports = { enqueueBatch, getQueueStats };
