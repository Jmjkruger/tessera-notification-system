const Handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

let compiledCompTicketTemplate = null;
let compiledPaidTicketTemplate = null;
let compiledNotificationTemplate = null;
let partialsRegistered = false;

function registerPartials() {
  if (partialsRegistered) return;
  const partialsDir = path.join(__dirname, '..', 'templates', 'partials');
  const partialFiles = {
    header: 'header.hbs',
    footer: 'footer.hbs',
    ticketCards: 'ticket-cards.hbs',
  };
  for (const [name, file] of Object.entries(partialFiles)) {
    const source = fs.readFileSync(path.join(partialsDir, file), 'utf-8');
    Handlebars.registerPartial(name, source);
  }
  partialsRegistered = true;
}

function getCompTicketTemplate() {
  registerPartials();
  if (!compiledCompTicketTemplate) {
    const templatePath = path.join(__dirname, '..', 'templates', 'comp-ticket.hbs');
    const source = fs.readFileSync(templatePath, 'utf-8');
    compiledCompTicketTemplate = Handlebars.compile(source);
  }
  return compiledCompTicketTemplate;
}

function getPaidTicketTemplate() {
  registerPartials();
  if (!compiledPaidTicketTemplate) {
    const templatePath = path.join(__dirname, '..', 'templates', 'paid-ticket.hbs');
    const source = fs.readFileSync(templatePath, 'utf-8');
    compiledPaidTicketTemplate = Handlebars.compile(source);
  }
  return compiledPaidTicketTemplate;
}

function getNotificationTemplate() {
  registerPartials();
  if (!compiledNotificationTemplate) {
    const templatePath = path.join(__dirname, '..', 'templates', 'notification.hbs');
    const source = fs.readFileSync(templatePath, 'utf-8');
    compiledNotificationTemplate = Handlebars.compile(source);
  }
  return compiledNotificationTemplate;
}

function buildTicketTemplateData({ event, tickets, combinedPdfUrl }) {
  const ticketData = tickets.map(t => ({
    attendeeName: [t.attendee_first_name, t.attendee_last_name].filter(Boolean).join(' '),
    ticketType: t.ticket_type || 'General',
    attendeePhone: t.attendee_phone || '',
    customFields: (t.custom_fields || []).filter(f => f.label && f.value),
    hasCustomFields: (t.custom_fields || []).some(f => f.label && f.value),
    pdfUrl: t.pdfUrl || '',
  }));

  return {
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
  };
}

/**
 * Render the comp ticket email HTML for one or more tickets to the same recipient.
 */
function renderCompTicketEmail({ event, tickets, combinedPdfUrl }) {
  const template = getCompTicketTemplate();
  const data = buildTicketTemplateData({ event, tickets, combinedPdfUrl });
  data.title = `Your Complimentary Ticket${data.multipleTickets ? 's' : ''} — ${data.eventName}`;
  data.footerText = 'If you believe you received this in error, please contact the event organizer.';
  return template(data);
}

/**
 * Render the paid ticket email HTML for one or more tickets to the same recipient.
 */
function renderPaidTicketEmail({ event, tickets, combinedPdfUrl, orderNumber }) {
  const template = getPaidTicketTemplate();
  const data = buildTicketTemplateData({ event, tickets, combinedPdfUrl });
  data.title = `Your Ticket${data.multipleTickets ? 's' : ''} — ${data.eventName}`;
  data.footerText = 'If you believe you received this in error, please contact the event organizer.';
  data.orderNumber = orderNumber || '';
  return template(data);
}

/**
 * Render a branded notification email (approval/denial/admin alerts).
 */
function renderNotificationEmail(data) {
  const template = getNotificationTemplate();
  return template({
    ...data,
    title: data.subject || 'Tessera Notification',
    footerText: data.footerText || 'If you have questions, contact us at support@tessera.co.zm',
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

module.exports = { renderCompTicketEmail, renderPaidTicketEmail, renderNotificationEmail, getLogoAttachment };
