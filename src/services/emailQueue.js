const { sendTicketEmail } = require('./sesClient');
const { updateTicketEmailStatus } = require('./wpClient');
const { generateQR } = require('./qrGenerator');
const { renderCompTicketEmail, renderPaidTicketEmail, getLogoAttachment } = require('./templateEngine');
const { generateSignature } = require('../routes/pdf');

const CONCURRENCY = 3;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

let activeWorkers = 0;
const queue = [];
const stats = { queued: 0, sent: 0, failed: 0, processing: 0 };

function getQueueStats() {
  return { ...stats, pending: queue.length, activeWorkers };
}

/**
 * Group tickets by attendee_email and enqueue one job per recipient.
 * Each job contains all tickets for that email address.
 * @param {string} [type='comp'] - 'comp' or 'paid'
 * @param {string|number} [order_id] - WooCommerce order ID (paid tickets only)
 */
function enqueueBatch({ comp_post_id, event, tickets, wp_api_url, type = 'comp', order_id }) {
  const byEmail = {};
  for (const ticket of tickets) {
    const email = ticket.attendee_email;
    if (!byEmail[email]) byEmail[email] = [];
    byEmail[email].push(ticket);
  }

  for (const [email, recipientTickets] of Object.entries(byEmail)) {
    queue.push({ comp_post_id, event, tickets: recipientTickets, email, wp_api_url, type, order_id, retries: 0 });
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
  const { comp_post_id, event, tickets, email, wp_api_url, type = 'comp', order_id } = job;
  const batchRef = comp_post_id || order_id || 'unknown';
  const jobLabel = `${tickets.length} ${type} ticket(s) for ${email} in batch #${batchRef}`;

  try {
    const qrAttachments = [];
    for (let i = 0; i < tickets.length; i++) {
      const t = tickets[i];
      const qrBase64 = await generateQR(t.barcode || `TESS-${t.ticket_id}`);
      qrAttachments.push({
        cid: `qrcode-${i}`,
        base64: qrBase64,
        contentType: 'image/png',
        filename: `qrcode-${i}.png`,
      });
    }

    const tnsPublicUrl = process.env.TNS_PUBLIC_URL || '';
    const wpApiUrl = wp_api_url || process.env.WP_API_URL || '';
    const wpParam = wpApiUrl ? Buffer.from(wpApiUrl).toString('base64url') : '';

    const ticketsWithPdf = tickets.map(t => {
      if (tnsPublicUrl) {
        const sigPayload = wpParam ? `${t.ticket_id}:${wpApiUrl}` : String(t.ticket_id);
        const sig = generateSignature(sigPayload);
        const wpQuery = wpParam ? `&wp=${wpParam}` : '';
        t.pdfUrl = `${tnsPublicUrl}/api/ticket-pdf/${t.ticket_id}?sig=${sig}${wpQuery}`;
      }
      return t;
    });

    let combinedPdfUrl = '';
    if (tnsPublicUrl && tickets.length > 1) {
      const sortedIds = tickets.map(t => String(t.ticket_id)).sort();
      const idsStr = sortedIds.join(',');
      const sigPayload = wpParam ? `${idsStr}:${wpApiUrl}` : idsStr;
      const combinedSig = generateSignature(sigPayload);
      const wpQuery = wpParam ? `&wp=${wpParam}` : '';
      combinedPdfUrl = `${tnsPublicUrl}/api/tickets-pdf?ids=${idsStr}&sig=${combinedSig}${wpQuery}`;
    }

    const renderFn = type === 'paid' ? renderPaidTicketEmail : renderCompTicketEmail;
    const renderArgs = { event, tickets: ticketsWithPdf, combinedPdfUrl };
    if (type === 'paid' && order_id) {
      renderArgs.orderNumber = `#${order_id}`;
    }
    const html = renderFn(renderArgs);

    const inlineImages = [getLogoAttachment(), ...qrAttachments];

    const ticketWord = tickets.length === 1 ? 'ticket' : 'tickets';
    const subject = type === 'paid'
      ? `Your ${ticketWord} for ${event.name}`
      : `Your complimentary ${ticketWord} for ${event.name}`;
    await sendTicketEmail({
      to: email,
      subject,
      html,
      inlineImages,
    });

    for (const t of tickets) {
      await updateTicketEmailStatus(t.ticket_id, 'sent', comp_post_id, wp_api_url);
    }
    stats.sent++;
    console.log(`[TNS] Sent ${jobLabel}`);
  } catch (err) {
    console.error(`[TNS] Failed ${jobLabel}:`, err.message);

    if (job.retries < MAX_RETRIES) {
      job.retries++;
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, job.retries - 1);
      console.log(`[TNS] Retrying ${jobLabel} (attempt ${job.retries}/${MAX_RETRIES}) in ${delay}ms`);
      setTimeout(() => {
        queue.push(job);
        drainQueue();
      }, delay);
    } else {
      console.error(`[TNS] Exhausted retries for ${jobLabel}`);
      stats.failed++;
      for (const t of tickets) {
        try {
          await updateTicketEmailStatus(t.ticket_id, 'failed', comp_post_id, wp_api_url);
        } catch (updateErr) {
          console.error(`[TNS] Failed to update status for ticket #${t.ticket_id}:`, updateErr.message);
        }
      }
    }
  }
}

module.exports = { enqueueBatch, getQueueStats };
