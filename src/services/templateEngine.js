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
 *
 * @param {object} params
 * @param {object} params.event       - { name, date, time, venue, image_url }
 * @param {object} params.ticket      - { attendee_first_name, attendee_last_name, ticket_type }
 * @param {string} params.qrDataUrl   - QR code as data URL
 */
function renderCompTicketEmail({ event, ticket, qrDataUrl }) {
  const template = getTemplate();

  return template({
    logoSrc: getLogoBase64(),
    eventName: event.name,
    eventDate: event.date || '',
    eventTime: event.time || '',
    eventVenue: event.venue || '',
    eventImageUrl: event.image_url || '',
    attendeeName: [ticket.attendee_first_name, ticket.attendee_last_name].filter(Boolean).join(' '),
    ticketType: ticket.ticket_type || 'General',
    qrCodeSrc: qrDataUrl,
    year: new Date().getFullYear(),
  });
}

module.exports = { renderCompTicketEmail };
