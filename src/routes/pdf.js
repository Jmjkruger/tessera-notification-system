const { Router } = require('express');
const crypto = require('crypto');
const { generateTicketPDF, generateMultiTicketPDF } = require('../services/pdfGenerator');

const router = Router();

function getSecret() {
  return process.env.TNS_API_KEY;
}

function generateSignature(data) {
  return crypto.createHmac('sha256', getSecret()).update(String(data)).digest('hex');
}

function verifySignature(data, sig) {
  if (!sig || sig.length !== 64) return false;
  try {
    const expected = generateSignature(data);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

async function fetchTicketFromWP(ticketId, wpBaseUrl) {
  const baseUrl = wpBaseUrl || process.env.WP_API_URL;
  if (!baseUrl) throw new Error('WP API not configured');

  const res = await fetch(`${baseUrl}/tessera/v1/tns/ticket-data/${ticketId}`, {
    headers: { 'X-TNS-Key': getSecret() },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WP fetch failed (${res.status}): ${text}`);
  }
  return res.json();
}

function ticketToRenderData(ticket) {
  return {
    attendeeName: [ticket.attendee_first_name, ticket.attendee_last_name].filter(Boolean).join(' '),
    ticketType: ticket.ticket_type || 'General',
    attendeePhone: ticket.attendee_phone || '',
    customFields: ticket.custom_fields || [],
    barcode: ticket.barcode || `TESS-${ticket.ticket_id}`,
    event: ticket.event,
  };
}

/**
 * GET /api/ticket-pdf/:ticketId?sig=<hmac>
 * Download a single ticket as PDF.
 */
router.get('/ticket-pdf/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { sig, wp } = req.query;

    let wpApiUrl;
    if (wp) {
      wpApiUrl = Buffer.from(wp, 'base64url').toString();
      if (!verifySignature(`${ticketId}:${wpApiUrl}`, sig)) {
        return res.status(403).json({ error: 'Invalid signature' });
      }
    } else {
      if (!verifySignature(ticketId, sig)) {
        return res.status(403).json({ error: 'Invalid signature' });
      }
      wpApiUrl = process.env.WP_API_URL;
    }

    const ticket = await fetchTicketFromWP(ticketId, wpApiUrl);
    const renderData = ticketToRenderData(ticket);
    const pdfBuffer = await generateTicketPDF(renderData);

    const safeName = renderData.attendeeName.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-') || 'Ticket';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Ticket-${safeName}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    console.log(`[TNS] PDF generated for ticket #${ticketId} (${renderData.attendeeName})`);
  } catch (err) {
    console.error('[TNS] PDF error:', err.message);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

/**
 * GET /api/tickets-pdf?ids=123,456,789&sig=<hmac>
 * Download multiple tickets as a single combined PDF (one page per ticket).
 * Signature is computed over the sorted, comma-separated IDs.
 */
router.get('/tickets-pdf', async (req, res) => {
  try {
    const { ids, sig, wp } = req.query;
    if (!ids) return res.status(400).json({ error: 'Missing ids parameter' });

    const ticketIds = ids.split(',').map(id => id.trim()).filter(Boolean);
    if (ticketIds.length === 0) return res.status(400).json({ error: 'No ticket IDs provided' });

    const signedPayload = ticketIds.sort().join(',');
    let wpApiUrl;
    if (wp) {
      wpApiUrl = Buffer.from(wp, 'base64url').toString();
      if (!verifySignature(`${signedPayload}:${wpApiUrl}`, sig)) {
        return res.status(403).json({ error: 'Invalid signature' });
      }
    } else {
      if (!verifySignature(signedPayload, sig)) {
        return res.status(403).json({ error: 'Invalid signature' });
      }
      wpApiUrl = process.env.WP_API_URL;
    }

    const ticketsData = [];
    for (const tid of ticketIds) {
      try {
        const ticket = await fetchTicketFromWP(tid, wpApiUrl);
        ticketsData.push(ticketToRenderData(ticket));
      } catch (err) {
        console.error(`[TNS] PDF: Failed to fetch ticket #${tid}:`, err.message);
      }
    }

    if (ticketsData.length === 0) {
      return res.status(404).json({ error: 'No tickets found' });
    }

    const pdfBuffer = await generateMultiTicketPDF(ticketsData);

    const eventName = (ticketsData[0]?.event?.name || 'Event').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-');
    const filename = `Tickets-${eventName}-${ticketsData.length}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    console.log(`[TNS] Combined PDF generated: ${ticketsData.length} tickets for ${eventName}`);
  } catch (err) {
    console.error('[TNS] Combined PDF error:', err.message);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

module.exports = { router, generateSignature };
