const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const BRAND = [240, 90, 40];
const DARK = [31, 41, 55];
const MUTED = [107, 114, 128];
const LIGHT_MUTED = [156, 163, 175];
const BG = [248, 249, 250];
const BORDER = [229, 231, 235];
const WHITE = [255, 255, 255];

const PAGE_W = 396;
const MARGIN = 30;
const CONTENT_W = PAGE_W - MARGIN * 2;

function getLogoPath() {
  return path.join(__dirname, '..', 'assets', 'tessera-logo.png');
}

async function generateQRBuffer(data) {
  return QRCode.toBuffer(data || 'TESSERA', {
    type: 'png',
    width: 300,
    margin: 2,
    color: { dark: '#1f2937', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });
}

/**
 * Measure the height needed for all fields so we can draw the card background
 * at the correct size before placing text.
 */
function measureFields(doc, fields) {
  let h = 0;
  for (const { label, value, bold } of fields) {
    doc.font('Helvetica-Bold').fontSize(8);
    h += doc.heightOfString(label, { width: CONTENT_W - 20 }) + 1;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 13 : 11);
    h += doc.heightOfString(value, { width: CONTENT_W - 20 }) + 10;
  }
  return h;
}

/**
 * Estimate the total page height needed for a ticket so the content
 * (including QR code and footer) never gets clipped.
 */
function estimatePageHeight(ticketData) {
  const { attendeePhone, customFields } = ticketData;
  let fieldCount = 2; // ticket type + attendee (always present)
  if (attendeePhone) fieldCount++;
  if (customFields) {
    fieldCount += customFields.filter(f => f.label && f.value).length;
  }
  const BASE = 500;
  const PER_FIELD = 35;
  return Math.max(660, BASE + fieldCount * PER_FIELD);
}

function drawField(doc, label, value, x, y, width, bold = false) {
  doc.font('Helvetica-Bold').fontSize(8).fillColor(LIGHT_MUTED);
  doc.text(label, x, y, { width });
  y = doc.y + 1;
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 13 : 11).fillColor(DARK);
  doc.text(value, x, y, { width });
  return doc.y + 10;
}

/**
 * Render one ticket page into the given PDFDocument.
 */
async function renderTicketPage(doc, ticketData) {
  const { attendeeName, ticketType, attendeePhone, customFields, barcode, event } = ticketData;

  const qrBuffer = await generateQRBuffer(barcode || 'TESSERA');

  let y = MARGIN;

  // Logo
  const logoPath = getLogoPath();
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, (PAGE_W - 120) / 2, y, { width: 120 });
    y += 50;
  }

  // Event name
  y += 8;
  doc.font('Helvetica-Bold').fontSize(16).fillColor(DARK);
  doc.text(event.name, MARGIN, y, { width: CONTENT_W, align: 'center' });
  y = doc.y + 6;

  // Event detail line
  const parts = [event.date, event.time, event.venue].filter(Boolean);
  if (parts.length) {
    doc.font('Helvetica').fontSize(10).fillColor(MUTED);
    doc.text(parts.join('  ·  '), MARGIN, y, { width: CONTENT_W, align: 'center' });
    y = doc.y + 14;
  }

  // Accent bar
  doc.rect(MARGIN, y, CONTENT_W, 3).fill(BRAND);
  y += 14;

  // Build field list
  const fields = [
    { label: 'TICKET TYPE', value: ticketType || 'General', bold: true },
    { label: 'ATTENDEE', value: attendeeName },
  ];
  if (attendeePhone) fields.push({ label: 'PHONE', value: attendeePhone });
  if (customFields) {
    for (const f of customFields) {
      if (f.label && f.value) fields.push({ label: f.label.toUpperCase(), value: f.value });
    }
  }

  // Measure card height
  const fieldsHeight = measureFields(doc, fields);
  const cardPadding = 16;
  const cardHeight = fieldsHeight + cardPadding * 2;

  // Draw card background
  doc.roundedRect(MARGIN, y, CONTENT_W, cardHeight, 6).fill(BG);
  doc.roundedRect(MARGIN, y, CONTENT_W, cardHeight, 6).lineWidth(0.5).stroke(BORDER);

  // Draw fields inside card
  let fy = y + cardPadding;
  for (const { label, value, bold } of fields) {
    fy = drawField(doc, label, value, MARGIN + 12, fy, CONTENT_W - 24, bold);
  }
  y += cardHeight + 16;

  // QR code
  const qrSize = 130;
  const qrX = (PAGE_W - qrSize) / 2;
  const qrBoxPad = 10;
  doc.roundedRect(qrX - qrBoxPad, y - qrBoxPad, qrSize + qrBoxPad * 2, qrSize + qrBoxPad * 2, 6)
     .lineWidth(0.5).fillAndStroke(WHITE, BORDER);
  doc.image(qrBuffer, qrX, y, { width: qrSize, height: qrSize });
  y += qrSize + 10;

  doc.font('Helvetica').fontSize(8).fillColor(LIGHT_MUTED);
  doc.text('Scan at entry', MARGIN, y, { width: CONTENT_W, align: 'center' });
  y = doc.y + 16;

  // Disclaimer
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
  doc.text(
    'This is a complimentary ticket issued to the named attendee. Not for resale or transfer. Present this ticket at the event entrance for scanning.',
    MARGIN, y, { width: CONTENT_W, align: 'center', lineGap: 2 }
  );
  y = doc.y + 14;

  // Footer
  doc.font('Helvetica').fontSize(7).fillColor(LIGHT_MUTED);
  doc.text(`© ${new Date().getFullYear()} Tessera · Event Ticketing Platform`, MARGIN, y, { width: CONTENT_W, align: 'center' });
}

/**
 * Generate a single-ticket PDF and return as Buffer.
 */
async function generateTicketPDF(ticketData) {
  return new Promise(async (resolve, reject) => {
    const pageHeight = estimatePageHeight(ticketData);
    const doc = new PDFDocument({
      size: [PAGE_W, pageHeight],
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: { Title: `Ticket - ${ticketData.event.name}`, Author: 'Tessera Tickets' },
    });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      await renderTicketPage(doc, ticketData);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generate a multi-ticket PDF (one ticket per page) and return as Buffer.
 */
async function generateMultiTicketPDF(ticketsData) {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE_W, 660],
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: false,
      info: { Title: `Tickets - ${ticketsData[0]?.event?.name || 'Event'}`, Author: 'Tessera Tickets' },
    });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      for (let i = 0; i < ticketsData.length; i++) {
        const pageHeight = estimatePageHeight(ticketsData[i]);
        doc.addPage({ size: [PAGE_W, pageHeight] });
        await renderTicketPage(doc, ticketsData[i]);
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateTicketPDF, generateMultiTicketPDF };
