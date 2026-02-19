const Handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

let compiledTicketTemplate = null;
let compiledNotificationTemplate = null;

function getTicketTemplate() {
  if (!compiledTicketTemplate) {
    const templatePath = path.join(__dirname, '..', 'templates', 'comp-ticket.hbs');
    const source = fs.readFileSync(templatePath, 'utf-8');
    compiledTicketTemplate = Handlebars.compile(source);
  }
  return compiledTicketTemplate;
}

function getNotificationTemplate() {
  if (!compiledNotificationTemplate) {
    const templatePath = path.join(__dirname, '..', 'templates', 'notification.hbs');
    const source = fs.readFileSync(templatePath, 'utf-8');
    compiledNotificationTemplate = Handlebars.compile(source);
  }
  return compiledNotificationTemplate;
}

/**
 * Render the comp ticket email HTML for one or more tickets to the same recipient.
 * Each ticket object needs: { attendeeName, ticketType }
 * QR codes use cid:qrcode-0, cid:qrcode-1, etc.
 */
function renderCompTicketEmail({ event, tickets, combinedPdfUrl }) {
  const template = getTicketTemplate();

  const ticketData = tickets.map(t => ({
    attendeeName: [t.attendee_first_name, t.attendee_last_name].filter(Boolean).join(' '),
    ticketType: t.ticket_type || 'General',
    attendeePhone: t.attendee_phone || '',
    customFields: (t.custom_fields || []).filter(f => f.label && f.value),
    hasCustomFields: (t.custom_fields || []).some(f => f.label && f.value),
    pdfUrl: t.pdfUrl || '',
  }));

  return template({
    eventName: event.name,
    eventDate: event.date || '',
    eventTime: event.time || '',
    eventVenue: event.venue || '',
    eventImageUrl: event.image_url || '',
    tickets: ticketData,
    ticketCount: ticketData.length,
    multipleTickets: ticketData.length > 1,
    combinedPdfUrl: combinedPdfUrl || '',
    year: new Date().getFullYear(),
  });
}

/**
 * Render a branded notification email (approval/denial/admin alerts).
 */
function renderNotificationEmail(data) {
  const template = getNotificationTemplate();
  return template({
    ...data,
    year: new Date().getFullYear(),
  });
}

function getLogoAttachment() {
  const logoPath = path.join(__dirname, '..', 'assets', 'tessera-logo.png');
  const logoBuffer = fs.readFileSync(logoPath);
  return {
    cid: 'tessera-logo',
    base64: logoBuffer.toString('base64'),
    contentType: 'image/png',
    filename: 'tessera-logo.png',
  };
}

module.exports = { renderCompTicketEmail, renderNotificationEmail, getLogoAttachment };
