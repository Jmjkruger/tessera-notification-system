const Handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

let compiledTemplate = null;
let logoBase64 = null;

function getLogoBase64() {
  if (!logoBase64) {
    const logoPath = path.join(__dirname, '..', 'assets', 'tessera-logo.png');
    const logoBuffer = fs.readFileSync(logoPath);
    logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
  }
  return logoBase64;
}

function getTemplate() {
  if (!compiledTemplate) {
    const templatePath = path.join(__dirname, '..', 'templates', 'comp-ticket.hbs');
    const source = fs.readFileSync(templatePath, 'utf-8');
    compiledTemplate = Handlebars.compile(source);
  }
  return compiledTemplate;
}

/**
 * Render the comp ticket email HTML.
 * Logo and QR code use cid: references — the actual image data
 * is attached as inline MIME parts by the SES client.
 */
function renderCompTicketEmail({ event, ticket }) {
  const template = getTemplate();

  return template({
    eventName: event.name,
    eventDate: event.date || '',
    eventTime: event.time || '',
    eventVenue: event.venue || '',
    eventImageUrl: event.image_url || '',
    attendeeName: [ticket.attendee_first_name, ticket.attendee_last_name].filter(Boolean).join(' '),
    ticketType: ticket.ticket_type || 'General',
    year: new Date().getFullYear(),
  });
}

/**
 * Get the raw logo PNG buffer and base64 for CID attachment.
 */
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

module.exports = { renderCompTicketEmail, getLogoAttachment };
